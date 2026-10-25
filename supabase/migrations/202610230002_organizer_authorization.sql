-- TR Campeonatos: organizer authorization and platform administration.
-- This migration intentionally preserves existing organizations and memberships.

begin;

alter table public.profiles
  add column if not exists account_role text not null default 'visitor'
    check (account_role in ('visitor', 'organizer', 'platform_admin')),
  add column if not exists organizer_status text not null default 'pending'
    check (organizer_status in ('pending', 'approved', 'suspended', 'rejected')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

-- Preserve every organizer that already owns or participates in an organization.
update public.profiles profile
set account_role = 'organizer', organizer_status = 'approved'
where exists (
  select 1
  from public.organization_members membership
  where membership.user_id = profile.id
)
and profile.account_role = 'visitor';

create or replace function public.is_platform_administrator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_role = 'platform_admin'
      and organizer_status = 'approved'
  );
$$;

create or replace function public.is_approved_organizer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and account_role in ('organizer', 'platform_admin')
      and organizer_status = 'approved'
  );
$$;

create or replace function public.prevent_self_authorization_changes() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() = old.id
    and not public.is_platform_administrator()
    and (
      new.account_role is distinct from old.account_role
      or new.organizer_status is distinct from old.organizer_status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
    ) then
    raise exception 'Only a platform administrator can change organizer authorization';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_authorization_guard on public.profiles;
create trigger profiles_authorization_guard
before update on public.profiles
for each row execute function public.prevent_self_authorization_changes();

drop policy if exists profiles_self on public.profiles;
create policy profiles_self_read on public.profiles
for select to authenticated
using ((select auth.uid()) = id);
create policy profiles_self_update on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy profiles_platform_admin on public.profiles
for all to authenticated
using (public.is_platform_administrator())
with check (public.is_platform_administrator());

drop policy if exists organizations_create on public.organizations;
create policy organizations_create on public.organizations
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_approved_organizer()
);

drop policy if exists clubs_create on public.clubs;
create policy clubs_create on public.clubs
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_approved_organizer()
);

create or replace function public.review_organizer(target_user uuid, next_status text)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  reviewed public.profiles;
begin
  if not public.is_platform_administrator() then
    raise exception 'Not authorized to review organizers';
  end if;
  if next_status not in ('approved', 'suspended', 'rejected') then
    raise exception 'Invalid organizer status';
  end if;

  update public.profiles
  set account_role = case when next_status = 'approved' then 'organizer' else account_role end,
      organizer_status = next_status,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = target_user
  returning * into reviewed;

  if reviewed.id is null then
    raise exception 'User profile not found';
  end if;
  return reviewed;
end;
$$;

revoke all on function public.is_platform_administrator() from public;
revoke all on function public.is_approved_organizer() from public;
revoke all on function public.prevent_self_authorization_changes() from public;
revoke all on function public.review_organizer(uuid, text) from public;
grant execute on function public.is_platform_administrator() to authenticated;
grant execute on function public.is_approved_organizer() to authenticated;
grant execute on function public.review_organizer(uuid, text) to authenticated;

commit;

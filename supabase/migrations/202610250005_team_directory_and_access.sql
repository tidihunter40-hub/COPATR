-- Administrative team directory: clubs remain permanent identities, but the
-- working catalogue is isolated by the organization that registered each one.
begin;

alter table public.clubs add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

-- Preserve existing data: prefer the organization of an existing participation,
-- then the first organization membership of the creator. Unresolved legacy
-- clubs remain readable by their club members and are never deleted.
update public.clubs club
set organization_id = coalesce(
  club.organization_id,
  (select competition.organization_id
   from public.competition_entries entry
   join public.competition_seasons season on season.id = entry.season_id
   join public.competitions competition on competition.id = season.competition_id
   where entry.club_id = club.id
   order by entry.registered_at asc
   limit 1),
  (select membership.organization_id
   from public.organization_members membership
   where membership.user_id = club.created_by
   order by membership.created_at asc
   limit 1)
)
where club.organization_id is null;

create index if not exists clubs_organization_updated_idx on public.clubs (organization_id, updated_at desc);
create unique index if not exists clubs_organization_name_active_unique
  on public.clubs (organization_id, lower(trim(official_name)))
  where organization_id is not null and status <> 'archived';

create or replace function public.ensure_entry_organization_matches_club() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  entry_organization uuid;
  club_organization uuid;
begin
  select competition.organization_id into entry_organization
  from public.competition_seasons season
  join public.competitions competition on competition.id = season.competition_id
  where season.id = new.season_id;
  select organization_id into club_organization from public.clubs where id = new.club_id;
  if club_organization is not null and entry_organization is distinct from club_organization then
    raise exception 'A team can only be entered in competitions of its organization';
  end if;
  return new;
end;
$$;

drop trigger if exists competition_entry_organization_guard on public.competition_entries;
create trigger competition_entry_organization_guard
before insert or update of season_id, club_id on public.competition_entries
for each row execute function public.ensure_entry_organization_matches_club();

drop policy if exists clubs_create on public.clubs;
create policy clubs_create on public.clubs for insert to authenticated
with check (
  created_by = auth.uid()
  and organization_id is not null
  and public.is_approved_organizer()
  and public.is_organization_member(organization_id, 'editor')
);

drop policy if exists clubs_admin_update on public.clubs;
create policy clubs_admin_update on public.clubs for update to authenticated
using (
  public.is_club_member(id, 'admin')
  or (organization_id is not null and public.is_organization_member(organization_id, 'editor'))
)
with check (
  public.is_club_member(id, 'admin')
  or (organization_id is not null and public.is_organization_member(organization_id, 'editor'))
);

-- The public policy remains intentionally separate: a private team's row is
-- only visible to its club members or organization members.
drop policy if exists clubs_organization_read on public.clubs;
create policy clubs_organization_read on public.clubs for select to authenticated
using (organization_id is not null and public.is_organization_member(organization_id));

revoke all on function public.ensure_entry_organization_matches_club() from public;

comment on column public.clubs.organization_id is 'Administrative owner of the private team catalogue; historic participation snapshots remain unchanged.';
comment on function public.ensure_entry_organization_matches_club() is 'Prevents cross-organization team participation while preserving legacy clubs without an assigned organization.';

commit;

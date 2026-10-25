-- Keep suspended accounts out of organization and club data, and make
-- result/publication changes pass through validated, atomic functions.
begin;

create or replace function public.is_organization_member(target_organization uuid, minimum_role text default 'viewer') returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved_organizer() and exists (
    select 1 from public.organization_members membership
    where membership.organization_id = target_organization and membership.user_id = auth.uid()
      and case minimum_role
        when 'owner' then membership.role = 'owner'
        when 'admin' then membership.role in ('owner', 'admin')
        when 'editor' then membership.role in ('owner', 'admin', 'editor')
        else membership.role in ('owner', 'admin', 'editor', 'viewer') end
  );
$$;

create or replace function public.is_club_member(target_club uuid, minimum_role text default 'viewer') returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved_organizer() and exists (
    select 1 from public.club_members membership
    where membership.club_id = target_club and membership.user_id = auth.uid()
      and case minimum_role
        when 'owner' then membership.role = 'owner'
        when 'admin' then membership.role in ('owner', 'admin')
        when 'editor' then membership.role in ('owner', 'admin', 'editor')
        else membership.role in ('owner', 'admin', 'editor', 'viewer') end
  );
$$;

-- Only owners can add or promote organization members.
drop policy if exists organization_members_admin on public.organization_members;
drop policy if exists organization_members_owner on public.organization_members;
create policy organization_members_owner on public.organization_members
for all to authenticated
using (public.is_organization_member(organization_id, 'owner'))
with check (public.is_organization_member(organization_id, 'owner'));

create or replace function public.guard_match_result_writes() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or current_setting('tr.result_write', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' or new.home_score is not null or new.away_score is not null
       or new.confirmed_at is not null or new.confirmed_by is not null then
      raise exception 'Use the result service to record a score';
    end if;
  elsif new.status is distinct from old.status or new.home_score is distinct from old.home_score
     or new.away_score is distinct from old.away_score or new.confirmed_at is distinct from old.confirmed_at
     or new.confirmed_by is distinct from old.confirmed_by then
    raise exception 'Use the result service to change a score or match status';
  elsif old.status = 'confirmed' and (
    new.season_id is distinct from old.season_id or new.home_entry_id is distinct from old.home_entry_id
    or new.away_entry_id is distinct from old.away_entry_id or new.phase is distinct from old.phase
  ) then
    raise exception 'A confirmed match cannot be moved to another competition or team';
  end if;
  return new;
end;
$$;

drop trigger if exists matches_result_write_guard on public.matches;
create trigger matches_result_write_guard
before insert or update on public.matches
for each row execute function public.guard_match_result_writes();

create or replace function public.set_match_result(target_match uuid, target_home_score smallint, target_away_score smallint, target_status text default 'confirmed') returns public.matches
language plpgsql security definer set search_path = public as $$
declare updated_match public.matches;
declare target_organization uuid;
declare previous_shootout public.penalty_shootouts;
begin
  if target_home_score is null or target_away_score is null or target_home_score < 0 or target_away_score < 0 then
    raise exception 'Both scores must be nonnegative integers';
  end if;
  if target_status not in ('completed', 'confirmed') then raise exception 'Invalid result status'; end if;
  select c.organization_id into target_organization
  from public.matches m
    join public.competition_seasons s on s.id = m.season_id
    join public.competitions c on c.id = s.competition_id
  where m.id = target_match;
  if target_organization is null or not public.is_organization_member(target_organization, 'editor') then
    raise exception 'Not authorized to record this result';
  end if;
  perform set_config('tr.result_write', 'on', true);
  update public.matches
  set home_score = target_home_score, away_score = target_away_score, status = target_status,
      confirmed_at = case when target_status = 'confirmed' then now() else null end,
      confirmed_by = case when target_status = 'confirmed' then auth.uid() else null end
  where public.matches.id = target_match returning * into updated_match;
  if target_status <> 'confirmed' or target_home_score <> target_away_score then
    select * into previous_shootout from public.penalty_shootouts where match_id = target_match;
    if previous_shootout.match_id is not null then
      delete from public.penalty_shootouts where match_id = target_match;
      insert into public.audit_logs (actor_id, organization_id, entity_type, entity_id, action, before_data)
      values (auth.uid(), target_organization, 'penalty_shootout', target_match, 'removed_after_result_correction', to_jsonb(previous_shootout));
    end if;
  end if;
  return updated_match;
end;
$$;

create or replace function public.set_penalty_shootout(target_match uuid, target_home_score smallint, target_away_score smallint) returns public.penalty_shootouts
language plpgsql security definer set search_path = public as $$
declare fixture public.matches;
declare previous public.penalty_shootouts;
declare saved public.penalty_shootouts;
declare target_organization uuid;
begin
  select * into fixture from public.matches where public.matches.id = target_match for update;
  select c.organization_id into target_organization
  from public.competition_seasons s
  join public.competitions c on c.id = s.competition_id
  where s.id = fixture.season_id;
  if fixture.id is null or not public.is_organization_member(target_organization, 'editor') then
    raise exception 'Not authorized to record a penalty shootout';
  end if;
  if fixture.status <> 'confirmed' or fixture.home_score <> fixture.away_score
    or fixture.phase in ('league', 'groups') then
    raise exception 'Penalties require a confirmed tied knockout match';
  end if;
  if target_home_score is null or target_away_score is null or target_home_score < 0
    or target_away_score < 0 or target_home_score = target_away_score then
    raise exception 'The penalty shootout must have a winner';
  end if;
  select * into previous from public.penalty_shootouts where match_id = target_match;
  insert into public.penalty_shootouts (match_id, home_score, away_score, winning_entry_id)
  values (target_match, target_home_score, target_away_score,
    case when target_home_score > target_away_score then fixture.home_entry_id else fixture.away_entry_id end)
  on conflict (match_id) do update
  set home_score = excluded.home_score, away_score = excluded.away_score,
      winning_entry_id = excluded.winning_entry_id
  returning * into saved;
  update public.matches set updated_at = now() where public.matches.id = target_match;
  insert into public.audit_logs (actor_id, organization_id, entity_type, entity_id, action, before_data, after_data)
  values (auth.uid(), target_organization, 'penalty_shootout', target_match,
    case when previous.match_id is null then 'created' else 'corrected' end,
    to_jsonb(previous), to_jsonb(saved));
  return saved;
end;
$$;

create or replace function public.set_competition_publication(target_competition uuid, make_public boolean) returns public.competitions
language plpgsql security definer set search_path = public as $$
declare target public.competitions;
begin
  select * into target from public.competitions where public.competitions.id = target_competition for update;
  if target.id is null or not public.is_organization_member(target.organization_id, 'editor') then
    raise exception 'Not authorized to change publication';
  end if;
  if make_public is null then raise exception 'Publication choice is required'; end if;
  if make_public and not exists (
    select 1 from public.competition_seasons s
    where s.competition_id = target.id
      and (select count(*) from public.competition_entries e where e.season_id = s.id and e.status = 'confirmed') >= 2
      and exists (select 1 from public.matches m where m.season_id = s.id and m.status <> 'cancelled')
  ) then
    raise exception 'Add a season with at least two confirmed teams and one match before publishing';
  end if;
  perform set_config('tr.publication_write', 'on', true);
  update public.competitions
  set visibility = case when make_public then 'public' else 'private' end,
      status = case when make_public then 'active' else status end
  where public.competitions.id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.guard_competition_publication() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or current_setting('tr.publication_write', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.visibility <> 'private' or new.status <> 'draft' then
      raise exception 'New competitions must start as private drafts';
    end if;
  elsif new.visibility is distinct from old.visibility or new.status is distinct from old.status then
    raise exception 'Use the publication service to change visibility or status';
  end if;
  return new;
end;
$$;

drop trigger if exists competitions_publication_guard on public.competitions;
create trigger competitions_publication_guard
before insert or update on public.competitions
for each row execute function public.guard_competition_publication();

create or replace function public.create_competition_with_season(target_organization uuid, target_name text, target_sport text, target_season_label text, target_format text) returns public.competitions
language plpgsql security definer set search_path = public as $$
declare created public.competitions;
begin
  if not public.is_organization_member(target_organization, 'editor') then
    raise exception 'Not authorized to create a competition';
  end if;
  insert into public.competitions (organization_id, name, sport, visibility, status)
  values (target_organization, trim(target_name), target_sport, 'private', 'draft')
  returning * into created;
  insert into public.competition_seasons (competition_id, label, format, status)
  values (created.id, trim(target_season_label), target_format, 'draft');
  return created;
end;
$$;

-- The publication RPC is the only browser path allowed to change visibility.
revoke update on public.competitions from authenticated;
grant update (name, sport) on public.competitions to authenticated;
revoke delete on public.matches from authenticated;
revoke insert, update, delete on public.penalty_shootouts from authenticated;
revoke all on function public.guard_match_result_writes() from public;
revoke all on function public.guard_competition_publication() from public;
revoke all on function public.set_competition_publication(uuid, boolean) from public;
grant execute on function public.set_competition_publication(uuid, boolean) to authenticated;
revoke all on function public.set_penalty_shootout(uuid, smallint, smallint) from public;
grant execute on function public.set_penalty_shootout(uuid, smallint, smallint) to authenticated;
revoke all on function public.create_competition_with_season(uuid, text, text, text, text) from public;
grant execute on function public.create_competition_with_season(uuid, text, text, text, text) to authenticated;

-- A permanent club profile must not reveal a private competition's history.
drop policy if exists entries_read on public.competition_entries;
create policy entries_read on public.competition_entries for select to anon, authenticated using (
  exists (
    select 1 from public.competition_seasons s
    join public.competitions c on c.id = s.competition_id
    where s.id = public.competition_entries.season_id and (
      public.is_organization_member(c.organization_id)
      or (c.visibility = 'public' and public.competition_entries.status = 'confirmed')
    )
  )
);

drop policy if exists matches_read on public.matches;
create policy matches_read on public.matches for select to anon, authenticated using (
  exists (
    select 1 from public.competition_seasons s
    join public.competitions c on c.id = s.competition_id
    where s.id = public.matches.season_id and (
      public.is_organization_member(c.organization_id)
      or (c.visibility = 'public'
          and exists (select 1 from public.competition_entries e where e.id = public.matches.home_entry_id and e.status = 'confirmed')
          and exists (select 1 from public.competition_entries e where e.id = public.matches.away_entry_id and e.status = 'confirmed'))
    )
  )
);

drop policy if exists events_read on public.match_events;
create policy events_read on public.match_events for select to anon, authenticated using (
  exists (
    select 1 from public.matches m
    join public.competition_seasons s on s.id = m.season_id
    join public.competitions c on c.id = s.competition_id
    where m.id = public.match_events.match_id and (
      public.is_organization_member(c.organization_id)
      or (c.visibility = 'public' and m.status = 'confirmed' and public.match_events.event_type <> 'note')
    )
  )
);

drop policy if exists shootouts_read on public.penalty_shootouts;
create policy shootouts_read on public.penalty_shootouts for select to anon, authenticated using (
  exists (
    select 1 from public.matches m
    join public.competition_seasons s on s.id = m.season_id
    join public.competitions c on c.id = s.competition_id
    where m.id = public.penalty_shootouts.match_id and (public.is_organization_member(c.organization_id)
      or (c.visibility = 'public' and m.status = 'confirmed'))
  )
);

drop policy if exists history_read on public.club_history;
create policy history_read on public.club_history for select to anon, authenticated using (
  public.is_club_member(public.club_history.club_id)
  or (public.club_history.season_id is not null and exists (
    select 1 from public.competition_seasons s
    join public.competitions c on c.id = s.competition_id
    where s.id = public.club_history.season_id and c.visibility = 'public'
      and exists (select 1 from public.competition_entries e
        where e.season_id = s.id and e.club_id = public.club_history.club_id and e.status = 'confirmed')
  ))
);

-- A club entered in a published competition has a public profile and crest,
-- even while its separate identity verification is pending.
drop policy if exists clubs_public_read on public.clubs;
create policy clubs_public_read on public.clubs for select to anon, authenticated using (
  public.is_club_member(public.clubs.id)
  or public.clubs.status = 'active'
  or exists (
    select 1 from public.competition_entries e
    join public.competition_seasons s on s.id = e.season_id
    join public.competitions c on c.id = s.competition_id
    where e.club_id = public.clubs.id and e.status = 'confirmed' and c.visibility = 'public'
  )
);

drop policy if exists club_crests_read on storage.objects;
create policy club_crests_read on storage.objects for select to anon, authenticated using (
  storage.objects.bucket_id = 'club-crests' and (
    exists (select 1 from public.clubs c where c.id::text = (storage.foldername(storage.objects.name))[1]
      and (c.status = 'active' or public.is_club_member(c.id)))
    or exists (
      select 1 from public.competition_entries e
      join public.competition_seasons s on s.id = e.season_id
      join public.competitions c on c.id = s.competition_id
      where e.crest_path_snapshot = storage.objects.name and e.status = 'confirmed' and c.visibility = 'public'
    )
  )
);

commit;

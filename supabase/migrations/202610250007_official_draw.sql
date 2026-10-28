-- A confirmed draw and its first fixtures are one transaction. Existing seasons remain untouched.
begin;

alter table public.competition_entries add column if not exists group_label text
  check (group_label is null or group_label ~ '^Grupo [A-Z]$');
alter table public.competition_seasons add column if not exists draw_kind text
  check (draw_kind is null or draw_kind in ('round_robin', 'groups_knockout', 'knockout', 'corujao'));
alter table public.competition_seasons add column if not exists draw_confirmed_at timestamptz;

create or replace function public.guard_confirmed_draw() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or current_setting('tr.draw_write', true) = 'on' then return new; end if;
  if tg_table_name = 'competition_entries' then
    if new.group_label is distinct from old.group_label then
      raise exception 'Use the draw service to assign groups';
    end if;
  elsif tg_table_name = 'competition_seasons' then
    if new.draw_kind is distinct from old.draw_kind or new.draw_confirmed_at is distinct from old.draw_confirmed_at then
      raise exception 'Use the draw service to confirm a draw';
    end if;
  elsif tg_table_name = 'matches' then
    if exists (select 1 from public.competition_seasons s where s.id = new.season_id and s.draw_confirmed_at is not null) then
      raise exception 'Use the knockout advancement service after a confirmed draw';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists entries_draw_guard on public.competition_entries;
create trigger entries_draw_guard before update on public.competition_entries
for each row execute function public.guard_confirmed_draw();
drop trigger if exists seasons_draw_guard on public.competition_seasons;
create trigger seasons_draw_guard before update on public.competition_seasons
for each row execute function public.guard_confirmed_draw();
drop trigger if exists matches_draw_guard on public.matches;
create trigger matches_draw_guard before insert on public.matches
for each row execute function public.guard_confirmed_draw();

create or replace function public.confirm_competition_draw(
  target_season uuid, target_kind text, target_groups jsonb, target_fixtures jsonb
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  season_row public.competition_seasons;
  organization_id uuid;
  sport_name text;
  participant_ids uuid[];
  participant_count integer;
  assigned_ids uuid[] := '{}';
  group_item jsonb;
  entry_text text;
  group_name text;
  group_sizes integer[] := '{}';
  sorted_group_sizes integer[];
  seen_groups text[] := '{}';
  fixture jsonb;
  home_id uuid;
  away_id uuid;
  round_no integer;
  leg_no integer;
  phase_name text;
  fixture_count integer := 0;
  expected_count integer;
  pair_key text;
  seen_pairs text[] := '{}';
  seen_slots text[] := '{}';
  per_team jsonb := '{}'::jsonb;
  group_home text;
  group_away text;
  expected_phase text;
begin
  select * into season_row from public.competition_seasons where id = target_season for update;
  select c.organization_id, c.sport into organization_id, sport_name
    from public.competitions c where c.id = season_row.competition_id;
  if season_row.id is null or organization_id is null
     or not public.is_organization_member(organization_id, 'editor') then
    raise exception 'Not authorized to confirm this draw';
  end if;
  if season_row.status <> 'draft' or season_row.draw_confirmed_at is not null then
    raise exception 'Only an undrawn draft season can be confirmed';
  end if;
  if exists (select 1 from public.matches where season_id = target_season) then
    raise exception 'This season already has matches. Review them before drawing';
  end if;
  if target_kind not in ('round_robin', 'groups_knockout', 'knockout', 'corujao')
     or (target_kind = 'corujao' and (season_row.format <> 'groups_knockout' or sport_name <> 'E-sports'))
     or (target_kind <> 'corujao' and target_kind <> season_row.format) then
    raise exception 'The draw format does not match this season';
  end if;
  select array_agg(id order by id), count(*) into participant_ids, participant_count
    from public.competition_entries where season_id = target_season and status = 'confirmed';
  if participant_count < 2 or participant_count > 32 then
    raise exception 'A draw requires between 2 and 32 confirmed teams';
  end if;
  if target_groups is null or target_fixtures is null
     or jsonb_typeof(target_groups) <> 'array' or jsonb_typeof(target_fixtures) <> 'array'
     or jsonb_array_length(target_fixtures) < 1 or jsonb_array_length(target_fixtures) > 496 then
    raise exception 'Invalid draw payload';
  end if;
  if target_kind in ('round_robin', 'knockout') and jsonb_array_length(target_groups) <> 0 then
    raise exception 'This format does not use groups';
  end if;
  if target_kind in ('groups_knockout', 'corujao') then
    if jsonb_array_length(target_groups) < 2 or jsonb_array_length(target_groups) > 26 then
      raise exception 'Invalid number of groups';
    end if;
    for group_item in select value from jsonb_array_elements(target_groups) loop
      group_name := group_item->>'name';
      if group_name is null or group_name !~ '^Grupo [A-Z]$' or jsonb_typeof(group_item->'entryIds') <> 'array'
         or jsonb_array_length(group_item->'entryIds') not between 3 and 6 or group_name = any(seen_groups) then
        raise exception 'Each group needs a valid name and at least three teams';
      end if;
      seen_groups := array_append(seen_groups, group_name);
      group_sizes := array_append(group_sizes, jsonb_array_length(group_item->'entryIds'));
      for entry_text in select value from jsonb_array_elements_text(group_item->'entryIds') loop
        if entry_text::uuid <> all(participant_ids) or entry_text::uuid = any(assigned_ids) then
          raise exception 'A group contains an unknown or duplicate team';
        end if;
        assigned_ids := array_append(assigned_ids, entry_text::uuid);
        perform set_config('tr.draw_write', 'on', true);
        update public.competition_entries set group_label = group_name
          where id = entry_text::uuid and season_id = target_season;
      end loop;
    end loop;
    if cardinality(assigned_ids) <> participant_count then
      raise exception 'Every team must belong to exactly one group';
    end if;
    if (select max(size) - min(size) from unnest(group_sizes) size) > 1 then
      raise exception 'Groups are not balanced';
    end if;
  end if;
  if target_kind = 'knockout' and participant_count not in (2, 4, 8, 16) then
    raise exception 'Direct knockout requires a power of two; preliminary rounds need separate approval';
  end if;
  if target_kind = 'corujao' and participant_count not in (8, 10, 12, 16, 20, 24, 32) then
    raise exception 'This Corujao team count is not supported';
  end if;
  if target_kind = 'corujao' then
    select array_agg(size order by size) into sorted_group_sizes from unnest(group_sizes) size;
    if not (
      (participant_count = 8 and sorted_group_sizes = array[4,4]) or
      (participant_count = 10 and sorted_group_sizes = array[3,3,4]) or
      (participant_count = 12 and sorted_group_sizes = array[4,4,4]) or
      (participant_count = 16 and sorted_group_sizes = array[4,4,4,4]) or
      (participant_count = 20 and sorted_group_sizes = array[4,4,4,4,4]) or
      (participant_count = 24 and sorted_group_sizes = array[4,4,4,4,4,4]) or
      (participant_count = 32 and sorted_group_sizes = array[4,4,4,4,4,4,4,4])
    ) then
      raise exception 'The Corujao group distribution is invalid';
    end if;
  end if;
  expected_phase := case target_kind when 'round_robin' then 'league'
    when 'knockout' then case participant_count when 2 then 'final' when 4 then 'semifinal'
      when 8 then 'quarterfinal' when 16 then 'round_of_16' else null end
    else 'groups' end;
  if expected_phase is null then raise exception 'Unsupported first knockout phase'; end if;
  for fixture in select value from jsonb_array_elements(target_fixtures) loop
    home_id := (fixture->>'homeId')::uuid;
    away_id := (fixture->>'awayId')::uuid;
    round_no := (fixture->>'round')::integer;
    leg_no := coalesce((fixture->>'leg')::integer, 1);
    phase_name := fixture->>'phase';
    if home_id is null or away_id is null or home_id = away_id
       or home_id <> all(participant_ids) or away_id <> all(participant_ids)
       or round_no is null or round_no < 1 or round_no > 128 or leg_no < 1 or leg_no > 4
       or phase_name is null or phase_name <> expected_phase then
      raise exception 'Invalid fixture in draw';
    end if;
    pair_key := least(home_id::text, away_id::text) || ':' || greatest(home_id::text, away_id::text) || ':' || leg_no;
    if pair_key = any(seen_pairs) or (round_no::text || ':' || home_id::text) = any(seen_slots)
       or (round_no::text || ':' || away_id::text) = any(seen_slots) then
      raise exception 'Duplicate pairing or team scheduled twice in a round';
    end if;
    seen_pairs := array_append(seen_pairs, pair_key);
    seen_slots := array_append(seen_slots, round_no::text || ':' || home_id::text);
    seen_slots := array_append(seen_slots, round_no::text || ':' || away_id::text);
    if target_kind in ('groups_knockout', 'corujao') then
      select group_label into group_home from public.competition_entries where id = home_id;
      select group_label into group_away from public.competition_entries where id = away_id;
      if target_kind = 'groups_knockout' or participant_count <> 10 then
        if group_home is distinct from group_away then raise exception 'Teams are in different groups'; end if;
      end if;
    end if;
    per_team := jsonb_set(per_team, array[home_id::text], to_jsonb(coalesce((per_team->>home_id::text)::integer, 0) + 1));
    per_team := jsonb_set(per_team, array[away_id::text], to_jsonb(coalesce((per_team->>away_id::text)::integer, 0) + 1));
    insert into public.matches (season_id, phase, round_number, leg_number, scheduled_at, home_entry_id, away_entry_id)
    values (target_season, phase_name, round_no, leg_no,
      case when nullif(fixture->>'scheduledAt', '') is null then null else (fixture->>'scheduledAt')::timestamptz end,
      home_id, away_id);
    fixture_count := fixture_count + 1;
  end loop;
  expected_count := case target_kind when 'knockout' then participant_count / 2
    when 'corujao' then participant_count * 3 / 2
    when 'round_robin' then participant_count * (participant_count - 1) / 2
    else (select sum(size * (size - 1) / 2) from unnest(group_sizes) size) end;
  if target_kind = 'round_robin' then
    expected_count := expected_count * (select max(coalesce((value->>'leg')::integer, 1)) from jsonb_array_elements(target_fixtures));
  elsif target_kind = 'groups_knockout' then
    expected_count := expected_count * (select max(coalesce((value->>'leg')::integer, 1)) from jsonb_array_elements(target_fixtures));
  end if;
  if fixture_count <> expected_count then raise exception 'The fixture count is incomplete'; end if;
  if target_kind = 'corujao' then
    if (select count(distinct (value->>'round')::integer) from jsonb_array_elements(target_fixtures)) <> 3
       or exists (select 1 from unnest(participant_ids) id where (per_team->>id::text)::integer <> 3) then
      raise exception 'Corujao needs three matches per team in three complete rounds';
    end if;
  end if;
  perform set_config('tr.draw_write', 'on', true);
  update public.competition_seasons set draw_kind = target_kind, draw_confirmed_at = now()
    where id = target_season;
  insert into public.audit_logs (actor_id, organization_id, entity_type, entity_id, action, after_data)
    values (auth.uid(), organization_id, 'competition_season', target_season, 'draw_confirmed',
      jsonb_build_object('kind', target_kind, 'groups', target_groups, 'fixtures', fixture_count));
  return fixture_count;
end;
$$;

revoke all on function public.guard_confirmed_draw() from public;
revoke all on function public.confirm_competition_draw(uuid,text,jsonb,jsonb) from public;
grant execute on function public.confirm_competition_draw(uuid,text,jsonb,jsonb) to authenticated;

commit;

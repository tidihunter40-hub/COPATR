-- Eight-team Corujao: auditable tie draws and transactional phase progression.
-- The other approved team counts keep their existing draw behavior until their
-- cross-group qualification regulations are persisted and reviewed.
begin;

create table if not exists public.corujao_tiebreak_draws (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.competition_seasons(id) on delete restrict,
  group_label text not null check (group_label in ('Grupo A', 'Grupo B')),
  tie_key text not null,
  results_signature text not null,
  candidate_ids uuid[] not null,
  ordered_ids uuid[] not null,
  seed uuid not null,
  drawn_by uuid not null references public.profiles(id) on delete restrict,
  drawn_at timestamptz not null default now(),
  unique (season_id, group_label, tie_key, results_signature)
);
create index if not exists corujao_tiebreak_draws_season_idx
  on public.corujao_tiebreak_draws (season_id, drawn_at desc);
alter table public.corujao_tiebreak_draws enable row level security;
drop policy if exists corujao_tiebreak_draws_read on public.corujao_tiebreak_draws;
create policy corujao_tiebreak_draws_read on public.corujao_tiebreak_draws
  for select to anon, authenticated using (
    exists (
      select 1 from public.competition_seasons s
      join public.competitions c on c.id = s.competition_id
      where s.id = season_id and
        (c.visibility = 'public' or public.is_organization_member(c.organization_id))
    )
  );

create or replace function public.corujao_group_signature(target_season uuid) returns text
language sql stable security definer set search_path = public as $$
  select md5(coalesce(string_agg(
    m.id::text || ':' || m.status || ':' ||
    coalesce(m.home_score::text, '-') || ':' || coalesce(m.away_score::text, '-'),
    '|' order by m.id
  ), ''))
  from public.matches m where m.season_id = target_season and m.phase = 'groups';
$$;

create or replace function public.corujao_group_table(target_season uuid)
returns table (
  entry_id uuid, group_label text, points integer, wins integer,
  goal_difference integer, goals_for integer, tie_key text
)
language sql stable security definer set search_path = public as $$
  with games as (
    select m.home_entry_id entry_id, m.home_score scored, m.away_score conceded
      from public.matches m where m.season_id = target_season and m.phase = 'groups' and m.status = 'confirmed'
    union all
    select m.away_entry_id, m.away_score, m.home_score
      from public.matches m where m.season_id = target_season and m.phase = 'groups' and m.status = 'confirmed'
  ), totals as (
    select e.id entry_id, e.group_label,
      coalesce(sum(case when g.scored > g.conceded then 3 when g.scored = g.conceded then 1 else 0 end), 0)::integer points,
      coalesce(count(*) filter (where g.scored > g.conceded), 0)::integer wins,
      coalesce(sum(g.scored - g.conceded), 0)::integer goal_difference,
      coalesce(sum(g.scored), 0)::integer goals_for
    from public.competition_entries e left join games g on g.entry_id = e.id
    where e.season_id = target_season and e.status = 'confirmed'
    group by e.id, e.group_label
  )
  select t.entry_id, t.group_label, t.points, t.wins, t.goal_difference,
    t.goals_for, t.points::text || ':' || t.wins || ':' ||
    t.goal_difference || ':' || t.goals_for
  from totals t;
$$;

create or replace function public.corujao_state_revision(target_season uuid) returns text
language sql stable security definer set search_path = public as $$
  select md5(
    coalesce((select string_agg(
      m.id::text || ':' || m.phase || ':' || m.status || ':' ||
      coalesce(m.home_score::text, '-') || ':' || coalesce(m.away_score::text, '-') ||
      ':' || coalesce(p.winning_entry_id::text, '-'), '|' order by m.id
    ) from public.matches m left join public.penalty_shootouts p on p.match_id = m.id
    where m.season_id = target_season), '') || '#' ||
    coalesce((select string_agg(
      d.id::text || ':' || array_to_string(d.ordered_ids, ','),
      '|' order by d.id
    ) from public.corujao_tiebreak_draws d
    where d.season_id = target_season
      and d.results_signature = public.corujao_group_signature(target_season)), '')
  );
$$;

create or replace function public.corujao_advance_state(target_season uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.competition_seasons;
  organization_id uuid;
  competition_status text;
  team_count integer;
  group_count integer;
  group_games integer;
  pending jsonb;
  a_ids uuid[];
  b_ids uuid[];
  semis public.matches[];
  final_match public.matches;
  semifinal_count integer;
  final_count integer;
  first_winner uuid;
  second_winner uuid;
  champion uuid;
  runner_up uuid;
  revision text;
begin
  select * into s from public.competition_seasons where id = target_season;
  select c.organization_id, c.status into organization_id, competition_status from public.competitions c
    where c.id = s.competition_id;
  if s.id is null or not public.is_organization_member(organization_id) then
    raise exception 'Not authorized to view Corujao progression';
  end if;
  if s.draw_kind <> 'corujao' or s.draw_confirmed_at is null then
    return jsonb_build_object('status', 'draw_required');
  end if;
  if s.status = 'archived' or competition_status = 'archived' then
    return jsonb_build_object('status', 'archived',
      'message', 'Restaure o campeonato antes de avançar.');
  end if;
  select count(*), count(distinct group_label) into team_count, group_count
    from public.competition_entries
    where season_id = target_season and status = 'confirmed';
  if team_count <> 8 or group_count <> 2 or
    (select count(*) from public.competition_entries
      where season_id = target_season and status = 'confirmed' and group_label = 'Grupo A') <> 4 or
    (select count(*) from public.competition_entries
      where season_id = target_season and status = 'confirmed' and group_label = 'Grupo B') <> 4 then
    return jsonb_build_object('status', 'regulation_required',
      'message', 'A progressão oficial atual exige oito equipes em dois grupos de quatro.');
  end if;
  revision := public.corujao_state_revision(target_season);
  select count(*) into group_games from public.matches
    where season_id = target_season and phase = 'groups';
  if group_games <> 12 or exists (
    select 1 from public.matches where season_id = target_season and phase = 'groups'
      and (status <> 'confirmed' or home_score is null or away_score is null)
  ) then
    return jsonb_build_object('status', 'awaiting_results', 'phase', 'groups',
      'confirmed', (select count(*) from public.matches
        where season_id = target_season and phase = 'groups' and status = 'confirmed'),
      'total', 12);
  end if;
  if exists (
    select 1 from public.competition_entries e
    where e.season_id = target_season and e.status = 'confirmed'
      and (select count(*) from public.matches m where m.season_id = target_season
        and m.phase = 'groups' and e.id in (m.home_entry_id, m.away_entry_id)) <> 3
  ) then raise exception 'Incomplete group fixture schedule'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'group', t.group_label, 'tieKey', t.tie_key, 'candidates', t.candidates
  ) order by t.group_label, t.tie_key), '[]'::jsonb) into pending
  from (
    select ranked.group_label, ranked.tie_key,
      array_agg(ranked.entry_id order by ranked.entry_id) candidates,
      min(ranked.position) first_position
    from (
      select x.*, rank() over (
        partition by x.group_label
        order by x.points desc, x.wins desc, x.goal_difference desc, x.goals_for desc
      ) position
      from public.corujao_group_table(target_season) x
    ) ranked
    group by ranked.group_label, ranked.tie_key
    having count(*) > 1 and min(ranked.position) <= 2
  ) t
  where not exists (
    select 1 from public.corujao_tiebreak_draws d
    where d.season_id = target_season and d.group_label = t.group_label
      and d.tie_key = t.tie_key
      and d.results_signature = public.corujao_group_signature(target_season)
      and d.candidate_ids = t.candidates
  );
  if jsonb_array_length(pending) > 0 then
    return jsonb_build_object('status', 'tiebreak_required', 'phase', 'groups',
      'ties', pending, 'revision', revision);
  end if;

  select array_agg(t.entry_id order by t.points desc, t.wins desc,
    t.goal_difference desc, t.goals_for desc,
    coalesce(array_position(d.ordered_ids, t.entry_id), 99), t.entry_id)
    into a_ids
  from public.corujao_group_table(target_season) t
  left join public.corujao_tiebreak_draws d
    on d.season_id = target_season and d.group_label = t.group_label
    and d.tie_key = t.tie_key
    and d.results_signature = public.corujao_group_signature(target_season)
  where t.group_label = 'Grupo A';
  select array_agg(t.entry_id order by t.points desc, t.wins desc,
    t.goal_difference desc, t.goals_for desc,
    coalesce(array_position(d.ordered_ids, t.entry_id), 99), t.entry_id)
    into b_ids
  from public.corujao_group_table(target_season) t
  left join public.corujao_tiebreak_draws d
    on d.season_id = target_season and d.group_label = t.group_label
    and d.tie_key = t.tie_key
    and d.results_signature = public.corujao_group_signature(target_season)
  where t.group_label = 'Grupo B';

  select count(*) into semifinal_count from public.matches
    where season_id = target_season and phase = 'semifinal';
  if semifinal_count = 0 then
    return jsonb_build_object('status', 'ready', 'phase', 'semifinal',
      'revision', revision, 'qualifiers', jsonb_build_object(
        'Grupo A', to_jsonb(a_ids[1:2]), 'Grupo B', to_jsonb(b_ids[1:2])),
      'fixtures', jsonb_build_array(
        jsonb_build_object('homeId', a_ids[1], 'awayId', b_ids[2]),
        jsonb_build_object('homeId', b_ids[1], 'awayId', a_ids[2])));
  end if;
  if semifinal_count <> 2 then raise exception 'Invalid semifinal bracket'; end if;
  select array_agg(m order by m.id) into semis from public.matches m
    where m.season_id = target_season and m.phase = 'semifinal';
  if not (
    (semis[1].home_entry_id = a_ids[1] and semis[1].away_entry_id = b_ids[2]
      and semis[2].home_entry_id = b_ids[1] and semis[2].away_entry_id = a_ids[2]) or
    (semis[2].home_entry_id = a_ids[1] and semis[2].away_entry_id = b_ids[2]
      and semis[1].home_entry_id = b_ids[1] and semis[1].away_entry_id = a_ids[2])
  ) then raise exception 'Semifinal bracket differs from confirmed qualification'; end if;
  if exists (select 1 from unnest(semis) m where m.status <> 'confirmed'
    or m.home_score is null or m.away_score is null
    or (m.home_score = m.away_score and not exists (
      select 1 from public.penalty_shootouts p where p.match_id = m.id))) then
    return jsonb_build_object('status', 'awaiting_results', 'phase', 'semifinal',
      'confirmed', (select count(*) from public.matches
        where season_id = target_season and phase = 'semifinal' and status = 'confirmed'),
      'total', 2);
  end if;
  first_winner := case when semis[1].home_score > semis[1].away_score then semis[1].home_entry_id
    when semis[1].home_score < semis[1].away_score then semis[1].away_entry_id
    else (select p.winning_entry_id from public.penalty_shootouts p where p.match_id = semis[1].id) end;
  second_winner := case when semis[2].home_score > semis[2].away_score then semis[2].home_entry_id
    when semis[2].home_score < semis[2].away_score then semis[2].away_entry_id
    else (select p.winning_entry_id from public.penalty_shootouts p where p.match_id = semis[2].id) end;
  select count(*) into final_count from public.matches
    where season_id = target_season and phase = 'final';
  if final_count = 0 then
    return jsonb_build_object('status', 'ready', 'phase', 'final',
      'revision', revision, 'fixtures', jsonb_build_array(
        jsonb_build_object('homeId', first_winner, 'awayId', second_winner)));
  end if;
  if final_count <> 1 then raise exception 'Invalid final bracket'; end if;
  select * into final_match from public.matches
    where season_id = target_season and phase = 'final';
  if final_match.home_entry_id <> first_winner or final_match.away_entry_id <> second_winner then
    raise exception 'Final bracket differs from semifinal winners';
  end if;
  if final_match.status <> 'confirmed' or final_match.home_score is null
    or final_match.away_score is null or
    (final_match.home_score = final_match.away_score and not exists (
      select 1 from public.penalty_shootouts p where p.match_id = final_match.id)) then
    return jsonb_build_object('status', 'awaiting_results', 'phase', 'final',
      'confirmed', 0, 'total', 1);
  end if;
  champion := case when final_match.home_score > final_match.away_score then final_match.home_entry_id
    when final_match.home_score < final_match.away_score then final_match.away_entry_id
    else (select p.winning_entry_id from public.penalty_shootouts p where p.match_id = final_match.id) end;
  runner_up := case when champion = final_match.home_entry_id then final_match.away_entry_id
    else final_match.home_entry_id end;
  return jsonb_build_object('status', case when s.status = 'completed' then 'completed' else 'champion_ready' end,
    'phase', 'final', 'revision', revision, 'championId', champion, 'runnerUpId', runner_up);
end;
$$;

create or replace function public.draw_corujao_tiebreak(
  target_season uuid, target_group text, target_tie_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  organization_id uuid;
  state jsonb;
  tie jsonb;
  candidate_ids uuid[];
  ordered_ids uuid[];
  lottery_seed uuid := gen_random_uuid();
  saved public.corujao_tiebreak_draws;
begin
  select c.organization_id into organization_id from public.competition_seasons s
    join public.competitions c on c.id = s.competition_id where s.id = target_season for update of s;
  if organization_id is null or not public.is_organization_member(organization_id, 'editor') then
    raise exception 'Not authorized to draw a tiebreak';
  end if;
  state := public.corujao_advance_state(target_season);
  if state->>'status' <> 'tiebreak_required' then raise exception 'No unresolved tiebreak'; end if;
  select item into tie from jsonb_array_elements(state->'ties') item
    where item->>'group' = target_group and item->>'tieKey' = target_tie_key;
  if tie is null then raise exception 'This tiebreak is no longer pending'; end if;
  select array_agg(value::uuid order by value::uuid) into candidate_ids
    from jsonb_array_elements_text(tie->'candidates');
  select array_agg(id order by md5(lottery_seed::text || ':' || id::text), id)
    into ordered_ids from unnest(candidate_ids) id;
  insert into public.corujao_tiebreak_draws (
    season_id, group_label, tie_key, results_signature, candidate_ids,
    ordered_ids, seed, drawn_by
  ) values (
    target_season, target_group, target_tie_key,
    public.corujao_group_signature(target_season), candidate_ids,
    ordered_ids, lottery_seed, auth.uid()
  ) returning * into saved;
  insert into public.audit_logs (
    actor_id, organization_id, entity_type, entity_id, action, after_data
  ) values (
    auth.uid(), organization_id, 'corujao_tiebreak', saved.id,
    'tiebreak_drawn', to_jsonb(saved)
  );
  return jsonb_build_object('id', saved.id, 'seed', lottery_seed,
    'candidateIds', candidate_ids, 'orderedIds', ordered_ids);
end;
$$;

create or replace function public.confirm_corujao_advance(
  target_season uuid, expected_revision text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  organization_id uuid;
  state jsonb;
  phase_name text;
  fixture jsonb;
  inserted_ids uuid[] := '{}';
  created public.matches;
  champion uuid;
  runner_up uuid;
  champion_club uuid;
  runner_club uuid;
begin
  select c.organization_id into organization_id from public.competition_seasons s
    join public.competitions c on c.id = s.competition_id where s.id = target_season for update of s;
  if organization_id is null or not public.is_organization_member(organization_id, 'editor') then
    raise exception 'Not authorized to advance this competition';
  end if;
  state := public.corujao_advance_state(target_season);
  if expected_revision is null or state->>'revision' is distinct from expected_revision then
    raise exception 'Results changed. Review the preview again';
  end if;
  if state->>'status' not in ('ready', 'champion_ready') then
    raise exception 'This phase cannot advance yet';
  end if;
  phase_name := state->>'phase';
  if state->>'status' = 'ready' then
    if exists (select 1 from public.matches where season_id = target_season
      and phase = phase_name) then raise exception 'This phase already exists'; end if;
    perform set_config('tr.draw_write', 'on', true);
    perform set_config('tr.progression_write', 'on', true);
    for fixture in select value from jsonb_array_elements(state->'fixtures') loop
      insert into public.matches (
        season_id, phase, round_number, leg_number, home_entry_id, away_entry_id
      ) values (
        target_season, phase_name, 1, 1,
        (fixture->>'homeId')::uuid, (fixture->>'awayId')::uuid
      ) returning * into created;
      inserted_ids := array_append(inserted_ids, created.id);
    end loop;
    update public.competition_seasons set status = 'active'
      where id = target_season and status = 'draft';
    insert into public.audit_logs (
      actor_id, organization_id, entity_type, entity_id, action, after_data
    ) values (
      auth.uid(), organization_id, 'competition_season', target_season,
      'corujao_phase_advanced', jsonb_build_object('phase', phase_name,
        'matches', inserted_ids, 'preview', state)
    );
    return jsonb_build_object('status', 'created', 'phase', phase_name,
      'matchIds', inserted_ids);
  end if;
  if exists (select 1 from public.competition_titles
    where season_id = target_season and place in (1, 2)) then
    raise exception 'Titles already exist for this season';
  end if;
  champion := (state->>'championId')::uuid;
  runner_up := (state->>'runnerUpId')::uuid;
  perform set_config('tr.progression_write', 'on', true);
  select club_id into champion_club from public.competition_entries
    where season_id = target_season and id = champion;
  select club_id into runner_club from public.competition_entries
    where season_id = target_season and id = runner_up;
  update public.competition_seasons set status = 'completed', completed_at = now()
    where id = target_season and status in ('draft', 'active');
  update public.competition_entries set final_position = 1, final_phase = 'final'
    where id = champion and season_id = target_season;
  update public.competition_entries set final_position = 2, final_phase = 'final'
    where id = runner_up and season_id = target_season;
  insert into public.competition_titles (
    season_id, entry_id, club_id, place, title_type, confirmed_by
  ) values
    (target_season, champion, champion_club, 1, 'champion', auth.uid()),
    (target_season, runner_up, runner_club, 2, 'runner_up', auth.uid());
  insert into public.club_history (club_id, season_id, event_type, payload)
  values
    (champion_club, target_season, 'title_confirmed', jsonb_build_object('place', 1)),
    (runner_club, target_season, 'title_confirmed', jsonb_build_object('place', 2));
  insert into public.audit_logs (
    actor_id, organization_id, entity_type, entity_id, action, after_data
  ) values (
    auth.uid(), organization_id, 'competition_season', target_season,
    'corujao_champion_confirmed', state
  );
  return jsonb_build_object('status', 'completed', 'championId', champion,
    'runnerUpId', runner_up);
end;
$$;

-- Serialize result changes with advancement and reject edits to settled phases.
create or replace function public.guard_corujao_result_progression() returns trigger
language plpgsql security definer set search_path = public as $$
declare draw_kind text;
begin
  if tg_op <> 'UPDATE' or (
    new.status is not distinct from old.status and
    new.home_score is not distinct from old.home_score and
    new.away_score is not distinct from old.away_score
  ) then return new; end if;
  select s.draw_kind into draw_kind from public.competition_seasons s
    where s.id = old.season_id for update;
  if draw_kind <> 'corujao' then return new; end if;
  if (old.phase = 'groups' and exists (
      select 1 from public.matches m where m.season_id = old.season_id
        and m.phase in ('round_of_16', 'quarterfinal', 'semifinal', 'final')))
    or (old.phase in ('round_of_16', 'quarterfinal') and exists (
      select 1 from public.matches m where m.season_id = old.season_id
        and m.phase in ('semifinal', 'final')))
    or (old.phase = 'semifinal' and exists (
      select 1 from public.matches m where m.season_id = old.season_id and m.phase = 'final'))
    or (old.phase = 'final' and exists (
      select 1 from public.competition_titles t where t.season_id = old.season_id))
  then raise exception 'A later phase exists. Result correction requires administrative review'; end if;
  return new;
end;
$$;
drop trigger if exists matches_corujao_progression_guard on public.matches;
create trigger matches_corujao_progression_guard before update on public.matches
  for each row execute function public.guard_corujao_result_progression();

create or replace function public.guard_corujao_structure() returns trigger
language plpgsql security definer set search_path = public as $$
declare season_id uuid;
begin
  season_id := case when tg_op = 'DELETE' then old.season_id else new.season_id end;
  if exists (select 1 from public.competition_seasons s
      where s.id = season_id and s.draw_kind = 'corujao'
        and s.draw_confirmed_at is not null) then
    if tg_op = 'DELETE' then
      raise exception 'Confirmed Corujao fixtures cannot be moved or deleted';
    end if;
    if new.season_id is distinct from old.season_id or
      new.phase is distinct from old.phase or
      new.round_number is distinct from old.round_number or
      new.leg_number is distinct from old.leg_number or
      new.home_entry_id is distinct from old.home_entry_id or
      new.away_entry_id is distinct from old.away_entry_id then
      raise exception 'Confirmed Corujao fixtures cannot be moved or deleted';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists matches_corujao_structure_guard on public.matches;
create trigger matches_corujao_structure_guard before update or delete on public.matches
  for each row execute function public.guard_corujao_structure();

create or replace function public.guard_corujao_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare season_id uuid;
begin
  if tg_table_name = 'competition_seasons' then
    if new.draw_kind = 'corujao' and
      (new.status is distinct from old.status or
       new.completed_at is distinct from old.completed_at) and
      current_setting('tr.progression_write', true) is distinct from 'on' then
      raise exception 'Use Corujao progression to change the season status';
    end if;
  elsif tg_table_name = 'competition_entries' then
    season_id := new.season_id;
    if (new.final_position is distinct from old.final_position or
        new.final_phase is distinct from old.final_phase) and
      exists (select 1 from public.competition_seasons s
        where s.id = season_id and s.draw_kind = 'corujao') and
      current_setting('tr.progression_write', true) is distinct from 'on' then
      raise exception 'Use Corujao progression to finalize entries';
    end if;
  else
    season_id := case when tg_op = 'DELETE' then old.season_id else new.season_id end;
    if exists (select 1 from public.competition_seasons s
        where s.id = season_id and s.draw_kind = 'corujao') and
      current_setting('tr.progression_write', true) is distinct from 'on' then
      raise exception 'Use Corujao progression to confirm titles';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists seasons_corujao_completion_guard on public.competition_seasons;
create trigger seasons_corujao_completion_guard before update on public.competition_seasons
  for each row execute function public.guard_corujao_completion();
drop trigger if exists entries_corujao_completion_guard on public.competition_entries;
create trigger entries_corujao_completion_guard before update on public.competition_entries
  for each row execute function public.guard_corujao_completion();
drop trigger if exists titles_corujao_completion_guard on public.competition_titles;
create trigger titles_corujao_completion_guard before insert or update or delete
  on public.competition_titles for each row execute function public.guard_corujao_completion();

create or replace function public.guard_corujao_penalty_progression() returns trigger
language plpgsql security definer set search_path = public as $$
declare fixture public.matches;
declare draw_kind text;
begin
  select * into fixture from public.matches
    where id = case when tg_op = 'DELETE' then old.match_id else new.match_id end;
  select s.draw_kind into draw_kind from public.competition_seasons s
    where s.id = fixture.season_id for update;
  if draw_kind = 'corujao' and (
    (fixture.phase = 'semifinal' and exists (
      select 1 from public.matches m where m.season_id = fixture.season_id and m.phase = 'final'))
    or (fixture.phase = 'final' and exists (
      select 1 from public.competition_titles t where t.season_id = fixture.season_id))
  ) then raise exception 'A later phase exists. Penalty correction requires administrative review'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists penalty_corujao_progression_guard on public.penalty_shootouts;
create trigger penalty_corujao_progression_guard
  before insert or update or delete on public.penalty_shootouts
  for each row execute function public.guard_corujao_penalty_progression();

revoke all on table public.corujao_tiebreak_draws from public, anon;
grant select on table public.corujao_tiebreak_draws to anon, authenticated;
revoke all on function public.corujao_group_signature(uuid) from public, anon, authenticated;
revoke all on function public.corujao_group_table(uuid) from public, anon, authenticated;
revoke all on function public.corujao_state_revision(uuid) from public, anon, authenticated;
revoke all on function public.corujao_advance_state(uuid) from public, anon;
revoke all on function public.draw_corujao_tiebreak(uuid,text,text) from public, anon;
revoke all on function public.confirm_corujao_advance(uuid,text) from public, anon;
revoke all on function public.guard_corujao_result_progression() from public, anon, authenticated;
revoke all on function public.guard_corujao_structure() from public, anon, authenticated;
revoke all on function public.guard_corujao_completion() from public, anon, authenticated;
revoke all on function public.guard_corujao_penalty_progression() from public, anon, authenticated;
grant execute on function public.corujao_advance_state(uuid) to authenticated;
grant execute on function public.draw_corujao_tiebreak(uuid,text,text) to authenticated;
grant execute on function public.confirm_corujao_advance(uuid,text) to authenticated;

commit;

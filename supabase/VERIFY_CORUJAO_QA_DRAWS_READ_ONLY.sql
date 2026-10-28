-- Somente leitura. Executar no SQL Editor do projeto zhoarvfjlbzzkhldfldd.
-- Temporada privada QA Corujão Sorteio 8.

with draws as (
  select d.*,
    public.corujao_group_signature(d.season_id) as current_signature,
    (select array_agg(entry_id order by md5(d.seed::text || ':' || entry_id::text), entry_id)
       from unnest(d.candidate_ids) as entry_id) as recomputed_order
  from public.corujao_tiebreak_draws d
  where d.season_id = '08f9ef20-74bb-4d84-88f7-841235ddc801'::uuid
)
select group_label, cardinality(candidate_ids) as candidates,
  cardinality(ordered_ids) as ordered,
  seed is not null as has_seed, drawn_by is not null as has_actor,
  drawn_at is not null as has_timestamp,
  results_signature = current_signature as matches_current_results,
  ordered_ids = recomputed_order as order_reproducible,
  (select count(distinct x.entry_id) from unnest(ordered_ids) as x(entry_id)) = cardinality(ordered_ids) as no_repeated_qualifier
from draws
order by group_label;

select d.group_label, position, e.club_name_snapshot as team_name,
  entry_id = any(d.candidate_ids) as was_candidate
from public.corujao_tiebreak_draws d
cross join lateral unnest(d.ordered_ids) with ordinality as ranked(entry_id, position)
join public.competition_entries e on e.id = ranked.entry_id
where d.season_id = '08f9ef20-74bb-4d84-88f7-841235ddc801'::uuid
order by d.group_label, position;

with a as (
  select ordered_ids from public.corujao_tiebreak_draws
  where season_id = '08f9ef20-74bb-4d84-88f7-841235ddc801'::uuid and group_label = 'Grupo A'
), b as (
  select ordered_ids from public.corujao_tiebreak_draws
  where season_id = '08f9ef20-74bb-4d84-88f7-841235ddc801'::uuid and group_label = 'Grupo B'
), semis as (
  select m.home_entry_id, m.away_entry_id from public.matches m
  where m.season_id = '08f9ef20-74bb-4d84-88f7-841235ddc801'::uuid and m.phase = 'semifinal'
)
select count(*) as semifinal_matches,
  count(*) filter (where (home_entry_id = a.ordered_ids[1] and away_entry_id = b.ordered_ids[2])
    or (home_entry_id = b.ordered_ids[1] and away_entry_id = a.ordered_ids[2])) as matches_drawn_qualifiers
from semis cross join a cross join b;

select d.group_label, count(a.id) as audit_events
from public.corujao_tiebreak_draws d
left join public.audit_logs a on a.entity_type = 'corujao_tiebreak'
  and a.entity_id = d.id and a.action = 'tiebreak_drawn'
where d.season_id = '08f9ef20-74bb-4d84-88f7-841235ddc801'::uuid
group by d.group_label
order by d.group_label;

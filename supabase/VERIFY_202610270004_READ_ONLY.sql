-- Read-only preflight/postflight for the eight-team Corujao progression.
-- Safe to run before applying 004; absent objects return NULL or zero rows.
select current_database() database_name, current_user database_role, now() checked_at;

select
  to_regprocedure('public.confirm_competition_draw(uuid,text,jsonb,jsonb)') as draw_007,
  to_regprocedure('public.create_competition_mode(uuid,text,text,text,text,text,text)') as mode_002,
  to_regprocedure('public.corujao_advance_state(uuid)') as advance_preview_004,
  to_regprocedure('public.draw_corujao_tiebreak(uuid,text,text)') as tie_draw_004,
  to_regprocedure('public.confirm_corujao_advance(uuid,text)') as advance_confirm_004,
  to_regclass('public.corujao_tiebreak_draws') as tie_history_004;

select p.proname, p.prosecdef security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') authenticated_execute
from pg_proc p
where p.oid in (
  to_regprocedure('public.corujao_advance_state(uuid)'),
  to_regprocedure('public.draw_corujao_tiebreak(uuid,text,text)'),
  to_regprocedure('public.confirm_corujao_advance(uuid,text)')
)
order by p.proname;

select c.relname table_name, c.relrowsecurity rls_enabled
from pg_class c
where c.oid = to_regclass('public.corujao_tiebreak_draws');

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'corujao_tiebreak_draws'
order by policyname;

select indexname, indexdef from pg_indexes
where schemaname = 'public' and
  indexname = 'corujao_tiebreak_draws_season_idx';

select event_object_table table_name, trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and trigger_name in (
    'matches_corujao_progression_guard',
    'matches_corujao_structure_guard',
    'penalty_corujao_progression_guard',
    'seasons_corujao_completion_guard',
    'entries_corujao_completion_guard',
    'titles_corujao_completion_guard'
  )
order by event_object_table, trigger_name;

-- Existing mutation RPCs remain closed to anon after 003.
select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') authenticated_execute
from pg_proc p
where p.oid in (
  to_regprocedure('public.set_match_result(uuid,smallint,smallint,text)'),
  to_regprocedure('public.set_penalty_shootout(uuid,smallint,smallint)'),
  to_regprocedure('public.confirm_competition_draw(uuid,text,jsonb,jsonb)'),
  to_regprocedure('public.set_competition_publication(uuid,boolean)')
)
order by p.proname;

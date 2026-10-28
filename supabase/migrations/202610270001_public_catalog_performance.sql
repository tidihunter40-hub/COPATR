-- Public catalogue reads: recent public competitions, their latest seasons,
-- entry counts, schedules, and the confirmed winners shown on the homepage.
create index if not exists competitions_public_updated_idx
  on public.competitions (updated_at desc)
  where visibility = 'public';

create index if not exists competition_seasons_competition_created_idx
  on public.competition_seasons (competition_id, created_at desc);

-- The existing unique index on (season_id, club_id) already serves lookups by season_id.

create index if not exists matches_season_schedule_idx
  on public.matches (season_id, scheduled_at asc nulls last, updated_at desc);

create index if not exists competition_titles_podium_confirmed_idx
  on public.competition_titles (confirmed_at desc)
  where place in (1, 2);

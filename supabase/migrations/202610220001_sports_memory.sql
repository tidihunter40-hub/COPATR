-- TR Campeonatos: persistent sports memory.
-- Apply with `supabase db push` only after configuring a Supabase project.

begin;

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(trim(display_name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  official_name text not null check (char_length(trim(official_name)) between 2 and 100),
  short_name text check (char_length(trim(short_name)) between 2 and 20),
  sport text not null check (sport in ('Futebol', 'Futsal', 'Vôlei', 'Basquete', 'E-sports')),
  primary_color text check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  crest_path text,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 3 and 120),
  sport text not null check (sport in ('Futebol', 'Futsal', 'Vôlei', 'Basquete', 'E-sports')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competition_seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete restrict,
  label text not null check (char_length(trim(label)) between 2 and 40),
  category text check (char_length(trim(category)) <= 60),
  format text not null check (format in ('round_robin', 'knockout', 'groups_knockout')),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  starts_on date,
  ends_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, label, category),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.competition_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.competition_seasons(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  club_name_snapshot text not null check (char_length(trim(club_name_snapshot)) between 2 and 100),
  club_short_name_snapshot text,
  crest_path_snapshot text,
  category_snapshot text,
  registered_at timestamptz not null default now(),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'withdrawn', 'disqualified')),
  final_position smallint check (final_position is null or final_position > 0),
  final_phase text,
  unique (season_id, club_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.competition_seasons(id) on delete restrict,
  phase text not null default 'league' check (phase in ('league', 'groups', 'round_of_16', 'quarterfinal', 'semifinal', 'third_place', 'final')),
  round_number smallint check (round_number is null or round_number > 0),
  leg_number smallint not null default 1 check (leg_number > 0),
  scheduled_at timestamptz,
  home_entry_id uuid not null references public.competition_entries(id) on delete restrict,
  away_entry_id uuid not null references public.competition_entries(id) on delete restrict,
  home_score smallint check (home_score is null or home_score >= 0),
  away_score smallint check (away_score is null or away_score >= 0),
  result_type text not null default 'regular' check (result_type in ('regular', 'extra_time', 'walkover', 'cancelled')),
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'confirmed', 'cancelled')),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_entry_id <> away_entry_id),
  check ((home_score is null and away_score is null) or (home_score is not null and away_score is not null)),
  check ((status in ('completed', 'confirmed') and home_score is not null and away_score is not null) or status not in ('completed', 'confirmed'))
);

create unique index matches_unique_slot on public.matches (season_id, phase, round_number, leg_number, home_entry_id, away_entry_id);
create index matches_season_status_idx on public.matches (season_id, status, scheduled_at);

create table public.match_result_revisions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  previous_home_score smallint,
  previous_away_score smallint,
  previous_status text,
  changed_by uuid references public.profiles(id) on delete set null,
  change_reason text check (char_length(change_reason) <= 300),
  changed_at timestamptz not null default now()
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  entry_id uuid references public.competition_entries(id) on delete set null,
  event_type text not null check (event_type in ('goal', 'own_goal', 'yellow_card', 'red_card', 'note')),
  minute smallint check (minute is null or minute between 0 and 180),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.penalty_shootouts (
  match_id uuid primary key references public.matches(id) on delete cascade,
  home_score smallint not null check (home_score >= 0),
  away_score smallint not null check (away_score >= 0),
  winning_entry_id uuid not null references public.competition_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (home_score <> away_score)
);

create table public.competition_titles (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.competition_seasons(id) on delete restrict,
  entry_id uuid not null references public.competition_entries(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,
  place smallint not null check (place in (1, 2, 3)),
  title_type text not null check (title_type in ('champion', 'runner_up', 'third_place')),
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (season_id, place),
  unique (season_id, entry_id),
  unique (season_id, club_id),
  check ((place = 1 and title_type = 'champion') or (place = 2 and title_type = 'runner_up') or (place = 3 and title_type = 'third_place'))
);

create table public.club_history (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_id uuid references public.competition_seasons(id) on delete set null,
  event_type text not null check (event_type in ('entry_confirmed', 'competition_completed', 'title_confirmed', 'identity_claimed')),
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index competition_entries_club_idx on public.competition_entries (club_id, season_id);
create index competition_titles_club_idx on public.competition_titles (club_id, confirmed_at desc);
create index club_history_club_idx on public.club_history (club_id, occurred_at desc);
create index audit_logs_organization_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.validate_match_entries() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.competition_entries where id = new.home_entry_id and season_id = new.season_id)
     or not exists (select 1 from public.competition_entries where id = new.away_entry_id and season_id = new.season_id) then
    raise exception 'Match entries must belong to its season';
  end if;
  return new;
end;
$$;
create trigger match_entries_same_season before insert or update of season_id, home_entry_id, away_entry_id on public.matches for each row execute function public.validate_match_entries();

create or replace function public.validate_penalty_winner() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.matches where id = new.match_id and new.winning_entry_id in (home_entry_id, away_entry_id)) then
    raise exception 'Penalty winner must have played the match';
  end if;
  return new;
end;
$$;
create trigger penalty_winner_played before insert or update on public.penalty_shootouts for each row execute function public.validate_penalty_winner();

create or replace function public.validate_title_entry() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.competition_entries where id = new.entry_id and season_id = new.season_id and club_id = new.club_id) then
    raise exception 'Title entry must belong to the supplied club and season';
  end if;
  return new;
end;
$$;
create trigger title_entry_integrity before insert or update on public.competition_titles for each row execute function public.validate_title_entry();

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger organizations_updated before update on public.organizations for each row execute function public.set_updated_at();
create trigger clubs_updated before update on public.clubs for each row execute function public.set_updated_at();
create trigger competitions_updated before update on public.competitions for each row execute function public.set_updated_at();
create trigger seasons_updated before update on public.competition_seasons for each row execute function public.set_updated_at();
create trigger matches_updated before update on public.matches for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''));
  return new;
end;
$$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.create_profile_for_user();

create or replace function public.is_organization_member(target_organization uuid, minimum_role text default 'viewer') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
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
  select exists (
    select 1 from public.club_members membership
    where membership.club_id = target_club and membership.user_id = auth.uid()
      and case minimum_role
        when 'owner' then membership.role = 'owner'
        when 'admin' then membership.role in ('owner', 'admin')
        when 'editor' then membership.role in ('owner', 'admin', 'editor')
        else membership.role in ('owner', 'admin', 'editor', 'viewer') end
  );
$$;

create or replace function public.add_creator_as_organization_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.organization_members (organization_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end;
$$;
create trigger organization_owner after insert on public.organizations for each row execute function public.add_creator_as_organization_owner();

create or replace function public.add_creator_as_club_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.club_members (club_id, user_id, role, verified_at) values (new.id, new.created_by, 'owner', now());
  return new;
end;
$$;
create trigger club_owner after insert on public.clubs for each row execute function public.add_creator_as_club_owner();

create or replace function public.record_entry_in_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.club_history (club_id, season_id, event_type, occurred_at, payload)
  values (new.club_id, new.season_id, 'entry_confirmed', new.registered_at, jsonb_build_object('entry_id', new.id, 'status', new.status));
  return new;
end;
$$;
create trigger entry_history after insert on public.competition_entries for each row execute function public.record_entry_in_history();

create or replace function public.audit_match_result() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.home_score is distinct from new.home_score or old.away_score is distinct from new.away_score or old.status is distinct from new.status then
    insert into public.match_result_revisions (match_id, previous_home_score, previous_away_score, previous_status, changed_by)
    values (old.id, old.home_score, old.away_score, old.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger match_result_audit before update on public.matches for each row execute function public.audit_match_result();

create or replace function public.set_match_result(target_match uuid, target_home_score smallint, target_away_score smallint, target_status text default 'confirmed') returns public.matches
language plpgsql security definer set search_path = public as $$
declare updated_match public.matches;
begin
  if target_home_score < 0 or target_away_score < 0 then raise exception 'Scores cannot be negative'; end if;
  if target_status not in ('completed', 'confirmed') then raise exception 'Invalid result status'; end if;
  if not exists (
    select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id
    where m.id = target_match and public.is_organization_member(c.organization_id, 'editor')
  ) then raise exception 'Not authorized to record this result'; end if;
  update public.matches set home_score = target_home_score, away_score = target_away_score, status = target_status,
    confirmed_at = case when target_status = 'confirmed' then now() else confirmed_at end,
    confirmed_by = case when target_status = 'confirmed' then auth.uid() else confirmed_by end
  where id = target_match returning * into updated_match;
  return updated_match;
end;
$$;

create or replace function public.confirm_competition_title(target_season uuid, target_entry uuid, target_place smallint) returns public.competition_titles
language plpgsql security definer set search_path = public as $$
declare result_title public.competition_titles;
declare target_club uuid;
declare target_organization uuid;
begin
  select entry.club_id, competition.organization_id into target_club, target_organization
  from public.competition_entries entry join public.competition_seasons season on season.id = entry.season_id
  join public.competitions competition on competition.id = season.competition_id
  where entry.id = target_entry and entry.season_id = target_season;
  if target_club is null then raise exception 'Entry does not belong to the season'; end if;
  if not public.is_organization_member(target_organization, 'admin') then raise exception 'Not authorized to confirm titles'; end if;
  if not exists (select 1 from public.competition_seasons where id = target_season and status = 'completed') then raise exception 'The season must be completed before a title is confirmed'; end if;
  insert into public.competition_titles (season_id, entry_id, club_id, place, title_type, confirmed_by)
  values (target_season, target_entry, target_club, target_place,
    case target_place when 1 then 'champion' when 2 then 'runner_up' when 3 then 'third_place' end, auth.uid())
  returning * into result_title;
  insert into public.club_history (club_id, season_id, event_type, payload)
  values (target_club, target_season, 'title_confirmed', jsonb_build_object('title_id', result_title.id, 'place', target_place));
  return result_title;
end;
$$;

create or replace view public.club_lifetime_stats with (security_invoker = true) as
with official_matches as (
  select home_entry_id as entry_id, home_score as goals_for, away_score as goals_against from public.matches where status = 'confirmed'
  union all
  select away_entry_id, away_score, home_score from public.matches where status = 'confirmed'
), match_stats as (
  select entry.club_id, count(*)::int as matches_played,
    count(*) filter (where goals_for > goals_against)::int as wins,
    count(*) filter (where goals_for = goals_against)::int as draws,
    count(*) filter (where goals_for < goals_against)::int as losses,
    coalesce(sum(goals_for), 0)::int as goals_for, coalesce(sum(goals_against), 0)::int as goals_against
  from official_matches om join public.competition_entries entry on entry.id = om.entry_id group by entry.club_id
), title_stats as (
  select club_id, count(*) filter (where place = 1)::int as titles, count(*) filter (where place = 2)::int as runner_ups, count(*) filter (where place = 3)::int as third_places
  from public.competition_titles group by club_id
), participation_stats as (
  select club_id, count(*)::int as competitions_played from public.competition_entries where status = 'confirmed' group by club_id
)
select club.id as club_id, coalesce(participation_stats.competitions_played, 0) as competitions_played,
  coalesce(match_stats.matches_played, 0) as matches_played, coalesce(match_stats.wins, 0) as wins, coalesce(match_stats.draws, 0) as draws,
  coalesce(match_stats.losses, 0) as losses, coalesce(match_stats.goals_for, 0) as goals_for, coalesce(match_stats.goals_against, 0) as goals_against,
  coalesce(match_stats.goals_for, 0) - coalesce(match_stats.goals_against, 0) as goal_difference,
  case when coalesce(match_stats.matches_played, 0) = 0 then 0 else round((match_stats.wins * 3 + match_stats.draws)::numeric / (match_stats.matches_played * 3) * 100) end as performance,
  coalesce(title_stats.titles, 0) as titles, coalesce(title_stats.runner_ups, 0) as runner_ups, coalesce(title_stats.third_places, 0) as third_places
from public.clubs club left join match_stats on match_stats.club_id = club.id left join title_stats on title_stats.club_id = club.id left join participation_stats on participation_stats.club_id = club.id;

create or replace view public.club_season_stats with (security_invoker = true) as
with official_matches as (
  select season_id, home_entry_id as entry_id, home_score as goals_for, away_score as goals_against from public.matches where status = 'confirmed'
  union all
  select season_id, away_entry_id, away_score, home_score from public.matches where status = 'confirmed'
), match_stats as (
  select season_id, entry_id, count(*)::int as matches_played,
    count(*) filter (where goals_for > goals_against)::int as wins,
    count(*) filter (where goals_for = goals_against)::int as draws,
    count(*) filter (where goals_for < goals_against)::int as losses,
    coalesce(sum(goals_for), 0)::int as goals_for, coalesce(sum(goals_against), 0)::int as goals_against
  from official_matches group by season_id, entry_id
)
select entry.club_id, entry.season_id, entry.id as entry_id, entry.final_position, entry.final_phase,
  coalesce(match_stats.matches_played, 0) as matches_played, coalesce(match_stats.wins, 0) as wins,
  coalesce(match_stats.draws, 0) as draws, coalesce(match_stats.losses, 0) as losses,
  coalesce(match_stats.goals_for, 0) as goals_for, coalesce(match_stats.goals_against, 0) as goals_against,
  coalesce(match_stats.goals_for, 0) - coalesce(match_stats.goals_against, 0) as goal_difference,
  case when coalesce(match_stats.matches_played, 0) = 0 then 0 else round((match_stats.wins * 3 + match_stats.draws)::numeric / (match_stats.matches_played * 3) * 100) end as performance
from public.competition_entries entry left join match_stats on match_stats.entry_id = entry.id and match_stats.season_id = entry.season_id;

create or replace view public.club_ranking_by_sport with (security_invoker = true) as
select club.id as club_id, club.sport, club.official_name, stats.competitions_played, stats.matches_played, stats.wins, stats.goals_for, stats.titles,
  rank() over (partition by club.sport order by stats.titles desc, stats.wins desc, stats.goals_for desc, club.official_name) as historical_rank
from public.clubs club join public.club_lifetime_stats stats on stats.club_id = club.id
where club.status = 'active';

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_seasons enable row level security;
alter table public.competition_entries enable row level security;
alter table public.matches enable row level security;
alter table public.match_result_revisions enable row level security;
alter table public.match_events enable row level security;
alter table public.penalty_shootouts enable row level security;
alter table public.competition_titles enable row level security;
alter table public.club_history enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.clubs, public.competitions, public.competition_seasons, public.competition_entries, public.matches, public.match_events, public.penalty_shootouts, public.competition_titles, public.club_history to anon;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.organizations, public.organization_members, public.clubs, public.club_members, public.competitions, public.competition_seasons, public.competition_entries, public.matches, public.match_events, public.penalty_shootouts, public.competition_titles to authenticated;
grant update on public.profiles to authenticated;

revoke all on function public.create_profile_for_user() from public;
revoke all on function public.is_organization_member(uuid, text) from public;
revoke all on function public.is_club_member(uuid, text) from public;
revoke all on function public.add_creator_as_organization_owner() from public;
revoke all on function public.add_creator_as_club_owner() from public;
revoke all on function public.record_entry_in_history() from public;
revoke all on function public.audit_match_result() from public;
revoke all on function public.set_match_result(uuid, smallint, smallint, text) from public;
revoke all on function public.confirm_competition_title(uuid, uuid, smallint) from public;
grant execute on function public.is_organization_member(uuid, text) to anon, authenticated;
grant execute on function public.is_club_member(uuid, text) to anon, authenticated;
grant execute on function public.set_match_result(uuid, smallint, smallint, text) to authenticated;
grant execute on function public.confirm_competition_title(uuid, uuid, smallint) to authenticated;

create policy profiles_self on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy organizations_members_read on public.organizations for select to authenticated using (public.is_organization_member(id));
create policy organizations_create on public.organizations for insert to authenticated with check (created_by = (select auth.uid()));
create policy organizations_admin_update on public.organizations for update to authenticated using (public.is_organization_member(id, 'admin')) with check (public.is_organization_member(id, 'admin'));
create policy organization_members_read on public.organization_members for select to authenticated using (public.is_organization_member(organization_id));
create policy organization_members_admin on public.organization_members for all to authenticated using (public.is_organization_member(organization_id, 'admin')) with check (public.is_organization_member(organization_id, 'admin'));
create policy clubs_public_read on public.clubs for select to anon, authenticated using (status = 'active' or public.is_club_member(id));
create policy clubs_create on public.clubs for insert to authenticated with check (created_by = (select auth.uid()));
create policy clubs_admin_update on public.clubs for update to authenticated using (public.is_club_member(id, 'admin')) with check (public.is_club_member(id, 'admin'));
create policy club_members_read on public.club_members for select to authenticated using (public.is_club_member(club_id));
create policy club_members_admin on public.club_members for all to authenticated using (public.is_club_member(club_id, 'admin')) with check (public.is_club_member(club_id, 'admin'));
create policy competitions_read on public.competitions for select to anon, authenticated using (visibility = 'public' or public.is_organization_member(organization_id));
create policy competitions_editor on public.competitions for all to authenticated using (public.is_organization_member(organization_id, 'editor')) with check (public.is_organization_member(organization_id, 'editor'));
create policy seasons_read on public.competition_seasons for select to anon, authenticated using (exists (select 1 from public.competitions c where c.id = competition_id and (c.visibility = 'public' or public.is_organization_member(c.organization_id))));
create policy seasons_editor on public.competition_seasons for all to authenticated using (exists (select 1 from public.competitions c where c.id = competition_id and public.is_organization_member(c.organization_id, 'editor'))) with check (exists (select 1 from public.competitions c where c.id = competition_id and public.is_organization_member(c.organization_id, 'editor')));
create policy entries_read on public.competition_entries for select to anon, authenticated using (exists (select 1 from public.competition_seasons s join public.competitions c on c.id = s.competition_id where s.id = season_id and (c.visibility = 'public' or public.is_organization_member(c.organization_id))));
create policy entries_editor on public.competition_entries for all to authenticated using (exists (select 1 from public.competition_seasons s join public.competitions c on c.id = s.competition_id where s.id = season_id and public.is_organization_member(c.organization_id, 'editor'))) with check (exists (select 1 from public.competition_seasons s join public.competitions c on c.id = s.competition_id where s.id = season_id and public.is_organization_member(c.organization_id, 'editor')));
create policy matches_read on public.matches for select to anon, authenticated using (exists (select 1 from public.competition_seasons s join public.competitions c on c.id = s.competition_id where s.id = season_id and (c.visibility = 'public' or public.is_organization_member(c.organization_id))));
create policy matches_editor on public.matches for all to authenticated using (exists (select 1 from public.competition_seasons s join public.competitions c on c.id = s.competition_id where s.id = season_id and public.is_organization_member(c.organization_id, 'editor'))) with check (exists (select 1 from public.competition_seasons s join public.competitions c on c.id = s.competition_id where s.id = season_id and public.is_organization_member(c.organization_id, 'editor')));
create policy result_revisions_read on public.match_result_revisions for select to authenticated using (exists (select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id where m.id = match_id and public.is_organization_member(c.organization_id, 'editor')));
create policy events_read on public.match_events for select to anon, authenticated using (exists (select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id where m.id = match_id and (c.visibility = 'public' or public.is_organization_member(c.organization_id))));
create policy events_editor on public.match_events for all to authenticated using (exists (select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id where m.id = match_id and public.is_organization_member(c.organization_id, 'editor'))) with check (exists (select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id where m.id = match_id and public.is_organization_member(c.organization_id, 'editor')));
create policy shootouts_read on public.penalty_shootouts for select to anon, authenticated using (exists (select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id where m.id = match_id and (c.visibility = 'public' or public.is_organization_member(c.organization_id))));
create policy shootouts_editor on public.penalty_shootouts for all to authenticated using (exists (select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id where m.id = match_id and public.is_organization_member(c.organization_id, 'editor'))) with check (exists (select 1 from public.matches m join public.competition_seasons s on s.id = m.season_id join public.competitions c on c.id = s.competition_id where m.id = match_id and public.is_organization_member(c.organization_id, 'editor')));
create policy titles_read on public.competition_titles for select to anon, authenticated using (exists (select 1 from public.competition_seasons s join public.competitions c on c.id = s.competition_id where s.id = season_id and (c.visibility = 'public' or public.is_organization_member(c.organization_id))));
create policy history_read on public.club_history for select to anon, authenticated using (exists (select 1 from public.clubs c where c.id = club_id and (c.status = 'active' or public.is_club_member(c.id))));
create policy audits_admin_read on public.audit_logs for select to authenticated using (organization_id is not null and public.is_organization_member(organization_id, 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-crests', 'club-crests', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
create policy club_crests_read on storage.objects for select to anon, authenticated using (bucket_id = 'club-crests' and exists (select 1 from public.clubs c where c.id::text = (storage.foldername(name))[1] and (c.status = 'active' or public.is_club_member(c.id))));
create policy club_crests_write on storage.objects for insert to authenticated with check (bucket_id = 'club-crests' and public.is_club_member(((storage.foldername(name))[1])::uuid, 'editor'));
create policy club_crests_update on storage.objects for update to authenticated using (bucket_id = 'club-crests' and public.is_club_member(((storage.foldername(name))[1])::uuid, 'editor'));
create policy club_crests_delete on storage.objects for delete to authenticated using (bucket_id = 'club-crests' and public.is_club_member(((storage.foldername(name))[1])::uuid, 'editor'));

commit;

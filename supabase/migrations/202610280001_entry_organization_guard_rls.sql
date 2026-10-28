-- Resolve the team in a trusted context before comparing organization IDs.
-- A team hidden by clubs RLS must never look like a legacy team with no owner.
begin;

create or replace function public.ensure_entry_organization_matches_club()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  entry_organization uuid;
  club_organization uuid;
begin
  select competition.organization_id into entry_organization
  from public.competition_seasons season
  join public.competitions competition on competition.id = season.competition_id
  where season.id = new.season_id;
  if not found then
    raise exception 'Competition season not found';
  end if;

  select club.organization_id into club_organization
  from public.clubs club
  where club.id = new.club_id;
  if not found then
    raise exception 'Team not found';
  end if;

  -- Historic clubs without an organization keep their previous behavior.
  if club_organization is not null and club_organization <> entry_organization then
    raise exception 'A team can only be entered in competitions of its organization';
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_entry_organization_matches_club() from public;
comment on function public.ensure_entry_organization_matches_club() is
  'Checks cross-organization entries with trusted team visibility; preserves legacy unassigned clubs.';

commit;

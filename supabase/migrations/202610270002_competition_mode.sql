-- Persist the creation preset so the official planner can select Corujão again.
begin;

alter table public.competitions
  add column if not exists setup_mode text not null default 'standard'
  check (setup_mode in ('standard', 'corujao'));

create or replace function public.create_competition_mode(
  target_organization uuid, target_name text, target_sport text,
  target_format text, target_kind text, target_season_label text, target_mode text
) returns public.competitions
language plpgsql security definer set search_path = public as $$
declare created public.competitions;
begin
  if not public.is_organization_member(target_organization, 'editor') then
    raise exception 'Not authorized to create a competition';
  end if;
  if target_mode not in ('standard', 'corujao') then
    raise exception 'Invalid competition mode';
  end if;
  if target_kind not in ('single', 'categories')
     or target_format not in ('round_robin', 'groups_knockout', 'knockout') then
    raise exception 'Invalid competition setup';
  end if;
  if target_mode = 'corujao' and
     (target_kind <> 'single' or target_sport <> 'E-sports' or target_format <> 'groups_knockout') then
    raise exception 'Corujao requires one E-sports season with groups and knockout';
  end if;
  if length(trim(coalesce(target_name, ''))) not between 3 and 120
     or length(trim(coalesce(target_season_label, ''))) not between 2 and 40 then
    raise exception 'Invalid competition name or season';
  end if;

  insert into public.competitions
    (organization_id, name, sport, visibility, status, competition_kind, default_format, setup_mode)
  values
    (target_organization, trim(target_name), target_sport, 'private', 'draft', target_kind, target_format, target_mode)
  returning * into created;

  if target_kind = 'single' then
    insert into public.competition_seasons (competition_id, label, format, status)
    values (created.id, trim(target_season_label), target_format, 'draft');
  end if;
  return created;
end;
$$;

revoke all on function public.create_competition_mode(uuid,text,text,text,text,text,text) from public;
grant execute on function public.create_competition_mode(uuid,text,text,text,text,text,text) to authenticated;

commit;

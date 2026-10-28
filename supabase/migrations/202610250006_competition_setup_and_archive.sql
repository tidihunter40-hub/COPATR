-- Additive organizer workflow. Apply only after reviewing the target schema.
begin;

alter table public.competitions
  add column if not exists competition_kind text not null default 'single'
    check (competition_kind in ('single', 'categories')),
  add column if not exists default_format text not null default 'round_robin'
    check (default_format in ('round_robin', 'groups_knockout', 'knockout')),
  add column if not exists status_before_archive text
    check (status_before_archive in ('draft', 'active')),
  add column if not exists subtitle text check (subtitle is null or char_length(subtitle) <= 160),
  add column if not exists description text check (description is null or char_length(description) <= 3000),
  add column if not exists accent_color text not null default '#0878E8'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists regulation text check (regulation is null or char_length(regulation) <= 10000),
  add column if not exists prizes text check (prizes is null or char_length(prizes) <= 3000),
  add column if not exists location_mode text not null default 'online'
    check (location_mode in ('online', 'presential')),
  add column if not exists venue text check (venue is null or char_length(venue) <= 300),
  add column if not exists starts_on date,
  add column if not exists ends_on date;

alter table public.competitions
  add constraint competitions_date_order check (ends_on is null or starts_on is null or ends_on >= starts_on);

grant update (name, subtitle, description, accent_color, regulation, prizes,
              location_mode, venue, starts_on, ends_on) on public.competitions to authenticated;

create or replace function public.create_competition_setup(
  target_organization uuid, target_name text, target_sport text,
  target_format text, target_kind text, target_season_label text
) returns public.competitions
language plpgsql security definer set search_path = public as $$
declare created public.competitions;
begin
  if not public.is_organization_member(target_organization, 'editor') then
    raise exception 'Not authorized to create a competition';
  end if;
  if target_kind not in ('single', 'categories') then
    raise exception 'Invalid competition type';
  end if;
  if target_format not in ('round_robin', 'groups_knockout', 'knockout') then
    raise exception 'Invalid competition format';
  end if;
  if length(trim(coalesce(target_name, ''))) not between 3 and 120 then
    raise exception 'Competition name must have 3 to 120 characters';
  end if;
  insert into public.competitions (organization_id, name, sport, visibility, status, competition_kind, default_format)
  values (target_organization, trim(target_name), target_sport, 'private', 'draft', target_kind, target_format)
  returning * into created;
  if target_kind = 'single' then
    insert into public.competition_seasons (competition_id, label, format, status)
    values (created.id, trim(target_season_label), target_format, 'draft');
  end if;
  return created;
end;
$$;

create or replace function public.set_competition_archive(target_competition uuid, make_archived boolean)
returns public.competitions
language plpgsql security definer set search_path = public as $$
declare target public.competitions;
begin
  select * into target from public.competitions where id = target_competition for update;
  if target.id is null or not public.is_organization_member(target.organization_id, 'editor') then
    raise exception 'Not authorized to archive this competition';
  end if;
  if make_archived is null then raise exception 'Archive choice is required'; end if;
  if make_archived and target.status = 'archived' then return target; end if;
  if not make_archived and target.status <> 'archived' then return target; end if;
  perform set_config('tr.publication_write', 'on', true);
  perform set_config('tr.archive_write', 'on', true);
  update public.competitions
  set status = case when make_archived then 'archived' else coalesce(status_before_archive, 'draft') end,
      visibility = case when make_archived then 'private' else visibility end,
      status_before_archive = case when make_archived then target.status else null end,
      updated_at = now()
  where id = target_competition returning * into target;
  insert into public.audit_logs (actor_id, organization_id, entity_type, entity_id, action)
  values (auth.uid(), target.organization_id, 'competition', target.id,
          case when make_archived then 'archived' else 'restored' end);
  return target;
end;
$$;

create or replace function public.guard_archived_competition() returns trigger
language plpgsql security definer set search_path = public as $$
declare competition_status text;
declare parent_id uuid;
begin
  if tg_table_name = 'competitions' then
    if old.status = 'archived'
       and current_setting('tr.archive_write', true) is distinct from 'on' then
      raise exception 'Restore the archived competition before editing it';
    end if;
    return new;
  end if;
  if tg_table_name = 'competition_seasons' then
    parent_id := case when tg_op = 'DELETE' then old.competition_id else new.competition_id end;
    select status into competition_status from public.competitions
      where id = parent_id;
  elsif tg_table_name = 'competition_entries' then
    parent_id := case when tg_op = 'DELETE' then old.season_id else new.season_id end;
    select c.status into competition_status from public.competition_seasons s
      join public.competitions c on c.id = s.competition_id
      where s.id = parent_id;
  else
    parent_id := case when tg_op = 'DELETE' then old.season_id else new.season_id end;
    select c.status into competition_status from public.competition_seasons s
      join public.competitions c on c.id = s.competition_id
      where s.id = parent_id;
  end if;
  if competition_status = 'archived' then
    raise exception 'Restore the archived competition before editing it';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger competitions_archive_guard before update on public.competitions
  for each row execute function public.guard_archived_competition();
create trigger seasons_archive_guard before insert or update or delete on public.competition_seasons
  for each row execute function public.guard_archived_competition();
create trigger entries_archive_guard before insert or update or delete on public.competition_entries
  for each row execute function public.guard_archived_competition();
create trigger matches_archive_guard before insert or update or delete on public.matches
  for each row execute function public.guard_archived_competition();

create or replace function public.guard_participant_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_season uuid;
declare target_entry uuid;
begin
  if tg_op = 'UPDATE' and
     (to_jsonb(new) - 'final_position' - 'final_phase') =
     (to_jsonb(old) - 'final_position' - 'final_phase') then
    return new;
  end if;
  target_season := case when tg_op = 'DELETE' then old.season_id else new.season_id end;
  target_entry := case when tg_op = 'INSERT' then null else old.id end;
  if exists (select 1 from public.competition_seasons where id = target_season and status <> 'draft')
     or exists (select 1 from public.matches where season_id = target_season
       and status in ('in_progress', 'completed', 'confirmed')) then
    raise exception 'Participants cannot change after the competition has started';
  end if;
  if target_entry is not null and (case when tg_op = 'DELETE' then true else new.status = 'withdrawn' end)
     and exists (select 1 from public.matches where home_entry_id = target_entry or away_entry_id = target_entry) then
    raise exception 'Remove scheduled matches for this team before withdrawing it';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger participant_changes_guard before insert or update or delete on public.competition_entries
  for each row execute function public.guard_participant_changes();

revoke all on function public.create_competition_setup(uuid,text,text,text,text,text) from public;
grant execute on function public.create_competition_setup(uuid,text,text,text,text,text) to authenticated;
revoke all on function public.set_competition_archive(uuid,boolean) from public;
grant execute on function public.set_competition_archive(uuid,boolean) to authenticated;

commit;

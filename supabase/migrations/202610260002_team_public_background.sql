begin;

alter table public.clubs
  add column if not exists public_background_id integer;

alter table public.clubs
  drop constraint if exists clubs_public_background_id_range;

alter table public.clubs
  add constraint clubs_public_background_id_range
  check (public_background_id is null or public_background_id between 1 and 15);

comment on column public.clubs.public_background_id is
  'Optional stadium artwork selected for the team card on its public competition page. Null uses the default sports background.';

commit;

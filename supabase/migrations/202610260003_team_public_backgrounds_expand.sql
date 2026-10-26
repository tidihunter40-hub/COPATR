alter table public.clubs
  drop constraint if exists clubs_public_background_id_range;

alter table public.clubs
  add constraint clubs_public_background_id_range
  check (public_background_id is null or public_background_id between 1 and 20);

comment on column public.clubs.public_background_id is
  'Selected public team-card background asset, with 20 available options.';

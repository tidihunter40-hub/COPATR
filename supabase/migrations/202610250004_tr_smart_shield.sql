-- TR Smart Shield stores the untouched source and the display-ready derivative.
-- Applying this migration does not rewrite any historical competition snapshot.
begin;

alter table public.clubs
  add column if not exists crest_original_path text,
  add column if not exists crest_processed_path text,
  add column if not exists crest_processing_status text not null default 'original_fallback'
    check (crest_processing_status in ('pending', 'processing', 'processed', 'original_fallback', 'failed')),
  add column if not exists crest_processing_version smallint not null default 1 check (crest_processing_version > 0),
  add column if not exists crest_processing_meta jsonb not null default '{}'::jsonb;

-- Existing paths remain the canonical image until a club is reprocessed. This
-- preserves both public URLs and historic entry snapshots exactly as recorded.
update public.clubs
set crest_original_path = coalesce(crest_original_path, crest_path),
    crest_processing_status = case when crest_path is null then crest_processing_status else 'original_fallback' end
where crest_path is not null and crest_original_path is null;

create table if not exists public.club_crest_jobs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  source_path text not null,
  processed_path text,
  status text not null check (status in ('pending', 'processing', 'processed', 'original_fallback', 'failed')),
  processor text not null default 'tr-smart-shield-browser-v1',
  processing_meta jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists club_crest_jobs_club_created_idx on public.club_crest_jobs (club_id, created_at desc);

alter table public.club_crest_jobs enable row level security;
grant select, insert, update on public.club_crest_jobs to authenticated;

drop policy if exists club_crest_jobs_read on public.club_crest_jobs;
create policy club_crest_jobs_read on public.club_crest_jobs for select to authenticated
  using (public.is_club_member(club_id));
drop policy if exists club_crest_jobs_create on public.club_crest_jobs;
create policy club_crest_jobs_create on public.club_crest_jobs for insert to authenticated
  with check (public.is_club_member(club_id, 'editor') and created_by = auth.uid());
drop policy if exists club_crest_jobs_update on public.club_crest_jobs;
create policy club_crest_jobs_update on public.club_crest_jobs for update to authenticated
  using (public.is_club_member(club_id, 'editor'))
  with check (public.is_club_member(club_id, 'editor'));

comment on column public.clubs.crest_original_path is 'TR Smart Shield: original upload, retained for safe reprocessing.';
comment on column public.clubs.crest_processed_path is 'TR Smart Shield: standardized 512px transparent PNG when safe.';
comment on table public.club_crest_jobs is 'Audit trail for deterministic crest processing; no historical entry snapshot is changed.';

commit;

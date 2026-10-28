-- A competition owns its visual identity independently of participating clubs.
begin;

alter table public.competitions
  add column if not exists crest_path text,
  add column if not exists crest_original_path text,
  add column if not exists crest_processed_path text,
  add column if not exists crest_processing_meta jsonb not null default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('competition-crests', 'competition-crests', false, 3145728, array['image/png', 'image/jpeg'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists competition_crests_read on storage.objects;
create policy competition_crests_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'competition-crests' and exists (
    select 1 from public.competitions c
    where c.organization_id::text = (storage.foldername(name))[1]
      and c.id::text = (storage.foldername(name))[2]
      and (c.visibility = 'public' or public.is_organization_member(c.organization_id))
  )
);

drop policy if exists competition_crests_write on storage.objects;
create policy competition_crests_write on storage.objects for insert to authenticated with check (
  bucket_id = 'competition-crests' and exists (
    select 1 from public.competitions c
    where c.organization_id::text = (storage.foldername(name))[1]
      and c.id::text = (storage.foldername(name))[2]
      and public.is_organization_member(c.organization_id, 'editor')
  )
);

commit;

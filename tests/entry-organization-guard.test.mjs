import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('a equipe oculta pela RLS não pode ser inscrita em outra organização', async () => {
  const db = new PGlite();
  const original = await readFile('supabase/migrations/202610250005_team_directory_and_access.sql', 'utf8');
  const previousFunction = original.match(/create or replace function public\.ensure_entry_organization_matches_club\(\) returns trigger[\s\S]*?\$\$;/i)?.[0];
  assert.ok(previousFunction);
  await db.exec(`
    create role authenticated;
    create table public.organizations (id uuid primary key);
    create table public.competitions (id uuid primary key, organization_id uuid not null);
    create table public.competition_seasons (id uuid primary key, competition_id uuid not null);
    create table public.clubs (id uuid primary key, organization_id uuid);
    create table public.competition_entries (id uuid primary key, season_id uuid not null, club_id uuid not null);
    alter table public.clubs enable row level security;
    create policy clubs_visible on public.clubs for select to authenticated
      using (organization_id = '00000000-0000-4000-8000-000000000001'::uuid);
    grant usage on schema public to authenticated;
    grant select on public.clubs, public.competitions, public.competition_seasons to authenticated;
    grant insert on public.competition_entries to authenticated;
    insert into public.organizations values
      ('00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002');
    insert into public.competitions values
      ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001');
    insert into public.competition_seasons values
      ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011');
    insert into public.clubs values
      ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000002'),
      ('00000000-0000-4000-8000-000000000033',null);
  `);
  await db.exec(previousFunction);
  await db.exec(`create trigger competition_entry_organization_guard
    before insert on public.competition_entries for each row
    execute function public.ensure_entry_organization_matches_club();`);

  await db.exec('set role authenticated;');
  await db.exec(`insert into public.competition_entries values
    ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000032');`);
  await db.exec('reset role;');
  await db.exec(`delete from public.competition_entries where id = '00000000-0000-4000-8000-000000000041';`);
  await db.exec(await readFile('supabase/migrations/202610280001_entry_organization_guard_rls.sql', 'utf8'));

  await db.exec('set role authenticated;');
  await assert.rejects(db.exec(`insert into public.competition_entries values
    ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000032');`),
  /A team can only be entered in competitions of its organization/);
  await db.exec(`insert into public.competition_entries values
    ('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000031');`);
  await db.exec(`insert into public.competition_entries values
    ('00000000-0000-4000-8000-000000000043','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000033');`);
  await db.exec('reset role;');
  const saved = await db.query('select id from public.competition_entries order by id');
  assert.equal(saved.rows.length, 2);
  await db.close();
});

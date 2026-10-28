import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve('supabase/migrations/202610220001_sports_memory.sql'), 'utf8');
const smartShieldMigration = readFileSync(resolve('supabase/migrations/202610250004_tr_smart_shield.sql'), 'utf8');
const teamDirectoryMigration = readFileSync(resolve('supabase/migrations/202610250005_team_directory_and_access.sql'), 'utf8');
const competitionCrestMigration = readFileSync(resolve('supabase/migrations/202610260001_competition_crests.sql'), 'utf8');
const realMode = await import('../dist/supabase-real-mode.mjs');

test('migration preserva identidade, participações, auditoria e políticas de acesso', () => {
  for (const table of ['clubs', 'club_members', 'organizations', 'competition_seasons', 'competition_entries', 'matches', 'match_events', 'penalty_shootouts', 'competition_titles', 'club_history', 'audit_logs']) {
    assert.match(migration, new RegExp(`create table public\\.${table} \\(`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /unique \(season_id, club_id\)/);
  assert.match(migration, /unique \(season_id, place\)/);
  assert.match(migration, /status = 'confirmed'/);
  assert.match(migration, /create or replace function public\.set_match_result/);
  assert.match(migration, /create or replace function public\.confirm_competition_title/);
  assert.match(migration, /create or replace view public\.club_season_stats/);
  assert.match(migration, /create or replace view public\.club_ranking_by_sport/);
  assert.match(migration, /create policy club_crests_write/);
  assert.match(migration, /revoke all on all tables in schema public from anon, authenticated/);
  assert.match(migration, /revoke all on function public\.set_match_result\(uuid, smallint, smallint, text\) from public/);
  assert.match(migration, /grant execute on function public\.set_match_result\(uuid, smallint, smallint, text\) to authenticated/);
  assert.match(migration, /create policy clubs_public_read on public\.clubs for select to anon, authenticated/);
  assert.doesNotMatch(migration, /service_role/i);
});

test('TR Smart Shield mantém original, derivado e trilha de auditoria sob RLS', () => {
  assert.match(smartShieldMigration, /crest_original_path text/);
  assert.match(smartShieldMigration, /crest_processed_path text/);
  assert.match(smartShieldMigration, /create table if not exists public\.club_crest_jobs/);
  assert.match(smartShieldMigration, /alter table public\.club_crest_jobs enable row level security/);
  assert.match(smartShieldMigration, /historical competition snapshot/i);
  assert.doesNotMatch(smartShieldMigration, /service_role/i);
});

test('escudos de campeonatos ficam em bucket separado com acesso por organização', () => {
  assert.match(competitionCrestMigration, /add column if not exists crest_path text/);
  assert.match(competitionCrestMigration, /competition-crests/);
  assert.match(competitionCrestMigration, /file_size_limit, allowed_mime_types/);
  assert.match(competitionCrestMigration, /c\.organization_id::text = \(storage\.foldername\(name\)\)\[1\]/);
  assert.match(competitionCrestMigration, /public\.is_organization_member\(c\.organization_id, 'editor'\)/);
});

test('catálogo de equipes é separado por organização e protege participações cruzadas', () => {
  assert.match(teamDirectoryMigration, /add column if not exists organization_id uuid/);
  assert.match(teamDirectoryMigration, /clubs_organization_name_active_unique/);
  assert.match(teamDirectoryMigration, /ensure_entry_organization_matches_club/);
  assert.match(teamDirectoryMigration, /A team can only be entered in competitions of its organization/);
  assert.match(teamDirectoryMigration, /public\.is_organization_member\(organization_id, 'editor'\)/);
  assert.doesNotMatch(teamDirectoryMigration, /delete from public\.clubs/i);
});

test('cliente real permanece inativo sem configuração e não depende da chave administrativa', () => {
  const original = globalThis.TR_CAMPEONATOS_SUPABASE_CONFIG;
  delete globalThis.TR_CAMPEONATOS_SUPABASE_CONFIG;
  assert.deepEqual(realMode.getRealModeStatus(), { configured: false, signedIn: false, mode: 'not-configured' });
  globalThis.TR_CAMPEONATOS_SUPABASE_CONFIG = { url: 'https://example.supabase.co', anonKey: 'public-anon-key' };
  assert.deepEqual(realMode.getRealModeStatus(), { configured: true, signedIn: false, mode: 'auth-required' });
  if (original) globalThis.TR_CAMPEONATOS_SUPABASE_CONFIG = original; else delete globalThis.TR_CAMPEONATOS_SUPABASE_CONFIG;
});

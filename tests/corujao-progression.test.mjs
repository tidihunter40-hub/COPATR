import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sql = await readFile('supabase/migrations/202610270004_corujao_eight_progression.sql', 'utf8');
const actor = '00000000-0000-4000-8000-000000000001';
const org = '00000000-0000-4000-8000-000000000002';
const club = (n) => `00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;
const entry = (n) => `00000000-0000-4000-8000-${String(2000 + n).padStart(12, '0')}`;
const season = (n) => `00000000-0000-4000-8000-${String(3000 + n).padStart(12, '0')}`;
const competition = (n) => `00000000-0000-4000-8000-${String(4000 + n).padStart(12, '0')}`;
const q = (value) => `'${value}'`;
await db.exec(`
create role anon;
create role authenticated;
create schema auth;
create table public.profiles (id uuid primary key);
create table public.organizations (id uuid primary key);
create table public.competitions (
  id uuid primary key, organization_id uuid not null, status text default 'active',
  visibility text default 'private'
);
create table public.competition_seasons (
  id uuid primary key, competition_id uuid not null, draw_kind text,
  draw_confirmed_at timestamptz, status text not null default 'draft',
  completed_at timestamptz, updated_at timestamptz default now()
);
create table public.clubs (id uuid primary key);
create table public.competition_entries (
  id uuid primary key, season_id uuid not null, club_id uuid not null,
  group_label text, status text not null default 'confirmed',
  final_position smallint, final_phase text
);
create table public.matches (
  id uuid primary key default gen_random_uuid(), season_id uuid not null,
  phase text not null, round_number smallint, leg_number smallint default 1,
  home_entry_id uuid not null, away_entry_id uuid not null,
  home_score smallint, away_score smallint, status text not null default 'scheduled'
);
create table public.penalty_shootouts (
  match_id uuid primary key, winning_entry_id uuid not null
);
create table public.competition_titles (
  id uuid primary key default gen_random_uuid(), season_id uuid not null,
  entry_id uuid not null, club_id uuid not null, place smallint not null,
  title_type text not null, confirmed_by uuid not null,
  unique(season_id, place)
);
create table public.club_history (
  id uuid primary key default gen_random_uuid(), club_id uuid not null,
  season_id uuid, event_type text not null, payload jsonb not null
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid, organization_id uuid, entity_type text,
  entity_id uuid, action text, after_data jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
create function public.is_organization_member(uuid, text default 'viewer')
returns boolean language sql stable as
  $$ select current_setting('test.member', true) is distinct from 'off' $$;
insert into public.profiles values ('00000000-0000-4000-8000-000000000001');
insert into public.organizations values ('00000000-0000-4000-8000-000000000002');
`);
await db.exec(await readFile('supabase/migrations/202610250007_official_draw.sql', 'utf8'));
await db.exec(sql);
const state = async (id) => (await db.query(
  'select public.corujao_advance_state($1::uuid) as value', [id]
)).rows[0].value;
const expectError = async (action, pattern) => {
  await assert.rejects(action, pattern);
};
async function makeSeason(number, tied = false) {
  const sid = season(number);
  await db.query('insert into public.competitions(id,organization_id) values($1,$2)', [competition(number), org]);
  await db.query(`insert into public.competition_seasons(
    id,competition_id,draw_kind,draw_confirmed_at
  ) values($1,$2,'corujao',now())`, [sid, competition(number)]);
  const ids = Array.from({ length: 8 }, (_, i) => entry(number * 10 + i));
  for (let i = 0; i < 8; i++) {
    await db.query('insert into public.clubs values($1)', [club(number * 10 + i)]);
    await db.query(`insert into public.competition_entries(
      id,season_id,club_id,group_label
    ) values($1,$2,$3,$4)`, [
      ids[i], sid, club(number * 10 + i), i < 4 ? 'Grupo A' : 'Grupo B',
    ]);
  }
  await db.exec("select set_config('tr.draw_write','on',false)");
  for (const offset of [0, 4]) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      await db.query(`insert into public.matches(
        season_id,phase,round_number,home_entry_id,away_entry_id
      ) values($1,'groups',1,$2,$3)`, [sid, ids[offset + i], ids[offset + j]]);
    }
  }
  await db.exec("select set_config('tr.draw_write','off',false)");
  assert.equal((await state(sid)).status, 'awaiting_results');
  const games = (await db.query(`select id,home_entry_id,away_entry_id
    from public.matches where season_id=$1`, [sid])).rows;
  for (const game of games) {
    await db.query(`update public.matches set home_score=$2,away_score=0,
      status='confirmed' where id=$1`, [game.id, tied ? 0 : 1]);
  }
  return { sid, ids, games };
}

const regular = await makeSeason(1);
await expectError(() => db.query(`insert into public.matches(
  season_id,phase,round_number,home_entry_id,away_entry_id
) values($1,'semifinal',1,$2,$3)`, [
  regular.sid, regular.ids[0], regular.ids[5],
]), /Use the knockout advancement service/);
let preview = await state(regular.sid);
assert.equal(preview.status, 'ready');
assert.equal(preview.phase, 'semifinal');
assert.equal(preview.fixtures.length, 2);
assert.deepEqual(preview.qualifiers['Grupo A'], regular.ids.slice(0, 2));
assert.deepEqual(preview.qualifiers['Grupo B'], regular.ids.slice(4, 6));
assert.deepEqual(preview.fixtures, [
  { homeId: regular.ids[0], awayId: regular.ids[5] },
  { homeId: regular.ids[4], awayId: regular.ids[1] },
]);
await expectError(() => db.query('select public.confirm_corujao_advance($1,$2)', [
  regular.sid, 'stale-revision',
]), /Results changed/);
await db.query('select public.confirm_corujao_advance($1,$2)', [
  regular.sid, preview.revision,
]);
await expectError(() => db.query('select public.confirm_corujao_advance($1,$2)', [
  regular.sid, preview.revision,
]), /Results changed|cannot advance|already exists/);
await expectError(() => db.query(`update public.matches set home_score=2
  where id=$1`, [regular.games[0].id]), /later phase exists/i);
await expectError(() => db.query(`delete from public.matches where id=$1`,
  [regular.games[0].id]), /cannot be moved or deleted/i);
await expectError(() => db.query(`update public.matches set away_entry_id=$2
  where id=$1`, [regular.games[0].id, regular.ids[7]]), /cannot be moved or deleted/i);
const semis = (await db.query(`select id from public.matches
  where season_id=$1 and phase='semifinal'`, [regular.sid])).rows;
assert.equal(semis.length, 2);
for (const match of semis) await db.query(`update public.matches
  set home_score=1,away_score=0,status='confirmed' where id=$1`, [match.id]);
preview = await state(regular.sid);
assert.equal(preview.phase, 'final');
await db.query('select public.confirm_corujao_advance($1,$2)', [
  regular.sid, preview.revision,
]);
await expectError(() => db.query(`update public.matches set home_score=2
  where id=$1`, [semis[0].id]), /later phase exists/i);
const final = (await db.query(`select id from public.matches
  where season_id=$1 and phase='final'`, [regular.sid])).rows[0];
await db.query(`update public.matches set home_score=2,away_score=1,
  status='confirmed' where id=$1`, [final.id]);
preview = await state(regular.sid);
assert.equal(preview.status, 'champion_ready');
await db.query('select public.confirm_corujao_advance($1,$2)', [
  regular.sid, preview.revision,
]);
assert.equal((await state(regular.sid)).status, 'completed');
assert.equal((await db.query(`select count(*)::integer n from public.competition_titles
  where season_id=$1`, [regular.sid])).rows[0].n, 2);
await expectError(() => db.query(`update public.matches set home_score=3
  where id=$1`, [final.id]), /later phase exists/i);
await expectError(() => db.query(`insert into public.competition_titles(
  season_id,entry_id,club_id,place,title_type,confirmed_by
) values($1,$2,$3,3,'third_place',$4)`, [
  regular.sid, regular.ids[2], club(12), actor,
]), /Use Corujao progression/i);

const tied = await makeSeason(2, true);
preview = await state(tied.sid);
assert.equal(preview.status, 'tiebreak_required');
assert.equal(preview.ties.length, 2);
for (const tie of preview.ties) {
  await db.query(`select public.draw_corujao_tiebreak($1,$2,$3)`, [
    tied.sid, tie.group, tie.tieKey,
  ]);
}
await expectError(() => db.query(`select public.draw_corujao_tiebreak($1,$2,$3)`, [
  tied.sid, preview.ties[0].group, preview.ties[0].tieKey,
]), /No unresolved tiebreak/);
preview = await state(tied.sid);
assert.equal(preview.status, 'ready');
assert.equal((await db.query(`select count(*)::integer n
  from public.corujao_tiebreak_draws where season_id=$1`, [tied.sid])).rows[0].n, 2);
assert.equal((await db.query(`select count(*)::integer n from public.audit_logs
  where action='tiebreak_drawn'`)).rows[0].n, 2);
await db.exec("select set_config('test.member','off',false)");
await expectError(() => state(tied.sid), /Not authorized/);
console.log(JSON.stringify({ migration: 'compiled', completeFlow: 'passed',
  duplicateAdvance: 'blocked', downstreamEdits: 'blocked',
  auditableTies: 'passed', memberGuard: 'passed' }));
await db.close();

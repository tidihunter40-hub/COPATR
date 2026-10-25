import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const club = '11111111-1111-4111-8111-111111111111';
const rival = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seasonA = '22222222-2222-4222-8222-222222222222';
const seasonB = '33333333-3333-4333-8333-333333333333';
const entryA = '44444444-4444-4444-8444-444444444444';
const entryB = '55555555-5555-4555-8555-555555555555';
const rivalA = '66666666-6666-4666-8666-666666666666';
const rivalB = '77777777-7777-4777-8777-777777777777';
const entries = [
  { id: entryA, club_id: club, season_id: seasonA, status: 'confirmed', final_position: 2, final_phase: 'quarterfinal', season: { id: seasonA, label: '2026', format: 'groups_knockout', competition: { name: 'Liga Pública A', sport: 'Futebol' } } },
  { id: entryB, club_id: club, season_id: seasonB, status: 'confirmed', final_position: 1, final_phase: 'league', season: { id: seasonB, label: '2025', format: 'round_robin', competition: { name: 'Liga Pública B', sport: 'Futebol' } } },
];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
const writes = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/runtime-config.mjs', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const supabaseConfig = Object.freeze({ url: "https://tr-stage04.test", anonKey: "test-key" });' }));
  await context.route('https://tr-stage04.test/**', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`);
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    const isA = url.searchParams.get('season_id') === `eq.${seasonA}`;
    let data = [];
    if (table === 'clubs') data = [{ id: club, official_name: 'Clube Oficial Exemplo', sport: 'Futebol', crest_path: null, primary_color: '#087cff' }];
    if (table === 'club_lifetime_stats') data = [{ club_id: club, matches_played: 8, wins: 5, draws: 2, losses: 1, goals_for: 14, goals_against: 6, performance: 71, titles: 1, runner_ups: 0 }];
    if (table === 'competition_titles') data = url.searchParams.has('place') ? [{ id: 'title-a', season_id: seasonB, place: 1, club: { id: club, official_name: 'Clube Oficial Exemplo', crest_path: null }, season: { label: '2025', competition: { name: 'Liga Pública B', sport: 'Futebol' } } }] : [{ id: 'title-a', season_id: seasonB, place: 1, season: { label: '2025', competition: { name: 'Liga Pública B', sport: 'Futebol' } } }];
    if (table === 'competition_entries') data = url.searchParams.has('club_id') ? entries : isA ? [{ id: entryA, club_id: club, club_name_snapshot: 'Clube Oficial Exemplo', crest_path_snapshot: null }, { id: rivalA, club_id: rival, club_name_snapshot: 'Rival A', crest_path_snapshot: null }] : [{ id: entryB, club_id: club, club_name_snapshot: 'Clube Oficial Exemplo', crest_path_snapshot: null }, { id: rivalB, club_id: rival, club_name_snapshot: 'Rival B', crest_path_snapshot: null }];
    if (table === 'matches') data = isA ? [
      { id: 'm1', phase: 'groups', round_number: 1, leg_number: 1, home_entry_id: entryA, away_entry_id: rivalA, home_score: 2, away_score: 1, status: 'confirmed' },
      { id: 'm2', phase: 'quarterfinal', round_number: 2, leg_number: 1, home_entry_id: rivalA, away_entry_id: entryA, home_score: 1, away_score: 0, status: 'confirmed' },
    ] : [{ id: 'm3', phase: 'league', round_number: 1, leg_number: 1, home_entry_id: entryB, away_entry_id: rivalB, home_score: 3, away_score: 0, status: 'confirmed' }];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:45321/#galeria', { waitUntil: 'networkidle' });
  assert.match(await page.locator('.champions-empty .champion-record').innerText(), /Clube Oficial Exemplo/);
  await page.locator('.champions-empty .champion-record a').click();
  try { await page.locator('.trajectory-phases button').nth(1).waitFor({ timeout: 5000 }); }
  catch (error) { console.log('Official profile diagnostic:', (await page.locator('#club-profile-root').innerText()).slice(0, 1500), errors); throw error; }
  assert.equal(await page.locator('#club-season-select option').count(), 2);
  assert.equal(await page.locator('.trajectory-phases button').count(), 2, 'only existing phases render');
  assert.match(await page.locator('.profile-history').innerText(), /Liga Pública A/);
  assert.match(await page.locator('.profile-history').innerText(), /Liga Pública B/);
  await page.locator('.trajectory-phases button').nth(1).click();
  assert.match(await page.locator('.trajectory-field-heading').innerText(), /Quartas de final/);
  await page.locator('#club-season-select').selectOption(entryB);
  await page.waitForFunction(() => document.querySelector('.profile-section-head h4')?.textContent === 'Liga Pública B');
  await page.waitForFunction(() => document.querySelectorAll('.trajectory-phases button').length === 1);
  assert.equal(await page.locator('.trajectory-phases button').count(), 1);
  assert.match(await page.locator('.trajectory-field-heading').innerText(), /Pontos corridos/);
  assert.deepEqual(writes, [], 'official profile and gallery are read-only');
  assert.deepEqual(errors, [], 'official profile has no browser errors');
  console.log('Official history mock: gallery link, two seasons, existing phases, results, no writes, no console errors.');
  await context.close();
} finally { await browser.close(); }

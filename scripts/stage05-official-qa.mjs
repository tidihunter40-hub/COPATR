import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const clubA = '11111111-1111-4111-8111-111111111111';
const clubB = '22222222-2222-4222-8222-222222222222';
const titles = [
  { id: 'a', season_id: 'season-a', place: 1, confirmed_at: '2026-10-20', club: { id: clubA, official_name: 'Estrela Azul', crest_path: null }, season: { id: 'season-a', label: '2026', competition: { id: 'comp-a', name: 'Liga Azul', sport: 'Futebol' } } },
  { id: 'vice-a', season_id: 'season-a', place: 2, confirmed_at: '2026-10-20', club: { id: clubB, official_name: 'Vento Norte', crest_path: null }, season: { id: 'season-a', label: '2026', competition: { id: 'comp-a', name: 'Liga Azul', sport: 'Futebol' } } },
  { id: 'b', season_id: 'season-b', place: 1, confirmed_at: '2025-10-20', club: { id: clubB, official_name: 'Vento Norte', crest_path: null }, season: { id: 'season-b', label: '2025', competition: { id: 'comp-b', name: 'Copa Indoor', sport: 'Futsal' } } },
];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
const writes = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.route('**/runtime-config.mjs', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const supabaseConfig = Object.freeze({ url: "https://tr-stage05.test", anonKey: "test-key" });' }));
  await context.route('https://tr-stage05.test/**', (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request().url());
    const table = new URL(route.request().url()).pathname.split('/').pop();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(table === 'competition_titles' ? titles : []) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:45321/#galeria', { waitUntil: 'networkidle' });
  const cards = page.locator('.champions-empty .champion-record');
  assert.equal(await cards.count(), 2);
  assert.match(await cards.first().innerText(), /Estrela Azul/);
  assert.match(await cards.first().innerText(), /Vice: Vento Norte/);
  assert.equal(await page.locator('.champions-filters').isVisible(), true);
  await page.locator('[data-gallery-filter="sport"]').selectOption('Futsal');
  assert.equal(await cards.count(), 1);
  assert.match(await cards.first().innerText(), /Vento Norte/);
  await page.locator('[data-gallery-filter="sport"]').selectOption('');
  await page.locator('[data-gallery-filter="competition"]').selectOption('comp-a');
  assert.equal(await cards.count(), 1);
  assert.match(await cards.first().innerText(), /Liga Azul/);
  await page.locator('[data-gallery-filter="sport"]').selectOption('Futsal');
  assert.equal(await cards.count(), 0);
  assert.match(await page.locator('.champions-filter-empty').innerText(), /Nenhuma conquista confirmada/);
  await page.locator('[data-gallery-filter="sport"]').selectOption('');
  await page.locator('[data-gallery-filter="competition"]').selectOption('');
  await page.locator('[data-gallery-filter="season"]').selectOption('2025');
  assert.equal(await cards.count(), 1);
  await page.locator('[data-gallery-filter="season"]').selectOption('');
  await page.locator('[data-gallery-filter="club"]').selectOption(clubA);
  assert.equal(await cards.count(), 1);
  assert.equal(await cards.first().locator('a').getAttribute('href'), `#clube-${clubA}`);
  assert.equal(await page.locator('.champion-demo-card').count(), 1);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('Stage 05 official gallery mock passed: titles, vice, four filters, club links, no writes or console errors.');
  await context.close();
} finally { await browser.close(); }

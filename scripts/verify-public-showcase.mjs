import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const dist = resolve('dist');
const competitionId = '71111111-1111-4111-8111-111111111111';
const seasonId = '72222222-2222-4222-8222-222222222222';
const homeId = '73333333-3333-4333-8333-333333333331';
const awayId = '73333333-3333-4333-8333-333333333332';
const competition = { id: competitionId, name: 'Copa Oficial de Teste', sport: 'Futebol', status: 'active', visibility: 'public', updated_at: '2026-10-27T20:00:00Z' };
const rows = {
  competitions: [competition],
  competition_seasons: [{ id: seasonId, competition_id: competitionId, label: '2026', format: 'round_robin', status: 'active', starts_on: '2026-10-20', created_at: '2026-10-20T00:00:00Z' }],
  competition_entries: [
    { id: homeId, season_id: seasonId, club_name_snapshot: 'Atlético da Serra', status: 'confirmed' },
    { id: awayId, season_id: seasonId, club_name_snapshot: 'União Metropolitana', status: 'confirmed' },
  ],
  matches: [{ id: '74444444-4444-4444-8444-444444444444', season_id: seasonId, phase: 'league', round_number: 1, scheduled_at: '2026-10-27T19:00:00Z', home_entry_id: homeId, away_entry_id: awayId, home_score: 2, away_score: 1, status: 'confirmed', updated_at: '2026-10-27T21:00:00Z' }],
  competition_titles: [],
};
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml' };
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

async function openCatalog(mode, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'tr.local') return route.abort();
    if (url.pathname === '/runtime-config.mjs') return route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = Object.freeze({url:'http://tr.local',anonKey:'public-test-key'});" });
    if (url.pathname.startsWith('/rest/v1/')) {
      if (mode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"temporarily unavailable"}' });
      const table = url.pathname.slice('/rest/v1/'.length);
      const data = mode === 'published' ? rows[table] || [] : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    }
    const file = url.pathname === '/campeonatos' ? 'catalog.html' : url.pathname.slice(1);
    const path = resolve(dist, file);
    if (!path.startsWith(dist + sep)) return route.abort();
    try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
    catch { return route.fulfill({ status: 404, body: 'Not found' }); }
  });
  await page.goto('http://tr.local/campeonatos', { waitUntil: 'networkidle' });
  return { context, page, errors };
}

try {
  for (const width of [390, 768, 1440]) {
    const { context, page, errors } = await openCatalog('empty', width);
    await page.locator('.catalog-empty').waitFor();
    assert.equal(await page.locator('.championship-card').count(), 0);
    assert.match(await page.locator('#catalog-count').innerText(), /0 campeonatos publicados/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `catálogo vazio sem rolagem a ${width}px`);
    assert.deepEqual(errors, [], `catálogo vazio sem erro JS a ${width}px`);
    await context.close();

    const published = await openCatalog('published', width);
    await published.page.locator('.championship-card').waitFor();
    assert.equal(await published.page.locator('.championship-card').count(), 1);
    assert.match(await published.page.locator('.championship-card').innerText(), /Copa Oficial de Teste/);
    assert.match(await published.page.locator('.championship-card').innerText(), /2 equipes/);
    assert.match(await published.page.locator('.championship-card').innerText(), /Atlético da Serra/);
    assert.equal(await published.page.locator('.championship-open').getAttribute('href'), `/c/${competitionId}`);
    assert.ok(await published.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `catálogo publicado sem rolagem a ${width}px`);
    await published.page.locator('#championships-filters input[name="search"]').fill('inexistente');
    await published.page.locator('.catalog-empty').waitFor();
    assert.equal(await published.page.locator('.championship-card').count(), 0);
    await published.page.locator('#championships-filters input[name="search"]').fill('copa oficial');
    await published.page.locator('.championship-card').waitFor();
    assert.deepEqual(published.errors, [], `catálogo publicado sem erro JS a ${width}px`);
    await published.context.close();
    console.log(`${width}px: vazio, publicado, dados da temporada, busca e largura OK`);
  }

  const failed = await openCatalog('error', 390);
  await failed.page.locator('.catalog-error').waitFor();
  assert.match(await failed.page.locator('#catalog-count').innerText(), /indisponíveis/);
  assert.equal(await failed.page.locator('.championship-card').count(), 0);
  assert.deepEqual(failed.errors, []);
  await failed.context.close();
  console.log('Falha da API distinguida de catálogo vazio OK');
} finally {
  await browser.close();
}

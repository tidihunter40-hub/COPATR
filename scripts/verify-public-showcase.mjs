import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const dist = resolve('dist');
const captureDir = resolve('captures/vitrine-publica-2026-10-25');
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.jpe': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const competitionId = '71111111-1111-4111-8111-111111111111';
const organizationId = '70000000-0000-4000-8000-000000000001';
const userId = '70000000-0000-4000-8000-000000000002';
const seasonId = '72222222-2222-4222-8222-222222222222';
const homeId = '73333333-3333-4333-8333-333333333331';
const awayId = '73333333-3333-4333-8333-333333333332';
const matchId = '74444444-4444-4444-8444-444444444444';
const competition = { id: competitionId, organization_id: organizationId, name: 'Copa Oficial de Teste', sport: 'Futebol', status: 'active', visibility: 'public' };
const entries = [
  { id: homeId, season_id: seasonId, club_id: homeId, club_name_snapshot: 'Atlético da Serra', crest_path_snapshot: null, status: 'confirmed' },
  { id: awayId, season_id: seasonId, club_id: awayId, club_name_snapshot: 'União Metropolitana', crest_path_snapshot: null, status: 'confirmed' },
];
let score = [2, 1];
await mkdir(captureDir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

async function contextFor(mode, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  let signedIn = false;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'tr.local') return route.abort();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/runtime-config.mjs') return route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = Object.freeze({url:'http://tr.local',anonKey:'public-test-key'});" });
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      signedIn = true;
      const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'organizador@exemplo.invalid', app_metadata: { provider: 'email' }, user_metadata: { name: 'Organizador Teste' } };
      return json({ access_token: 'mock-access', refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user });
    }
    if (url.pathname === '/auth/v1/user') return signedIn ? json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'organizador@exemplo.invalid', app_metadata: { provider: 'email' }, user_metadata: { name: 'Organizador Teste' } }) : json({ code: 401, message: 'No session' }, 401);
    if (url.pathname === '/auth/v1/logout') { signedIn = false; return route.fulfill({ status: 204, body: '' }); }
    if (url.pathname.startsWith('/auth/v1/')) return json({ code: 401, message: 'No session' }, 401);
    if (url.pathname.startsWith('/rest/v1/')) {
      if (mode === 'error') return json({ message: 'Service temporarily unavailable' }, 503);
      const table = url.pathname.slice('/rest/v1/'.length);
      const single = route.request().headers().accept?.includes('application/vnd.pgrst.object+json');
      const published = mode === 'published';
      let rows = [];
      if (published && table === 'competitions') rows = [competition];
      if (published && table === 'competition_seasons') rows = [{ id: seasonId, competition_id: competitionId, label: '2026', format: 'round_robin', status: 'active' }];
      if (published && table === 'competition_entries') rows = entries;
      if (published && table === 'matches') rows = [{ id: matchId, season_id: seasonId, phase: 'league', round_number: 1, scheduled_at: '2026-10-24T19:00:00Z', home_entry_id: homeId, away_entry_id: awayId, home_score: score[0], away_score: score[1], status: 'confirmed', updated_at: '2026-10-25T00:00:00Z' }];
      if (signedIn && table === 'profiles') rows = [{ id: userId, display_name: 'Organizador Teste', account_role: 'organizer', organizer_status: 'approved' }];
      if (signedIn && table === 'organization_members') rows = [{ organization_id: organizationId, role: 'owner', organizations: { id: organizationId, name: 'Organização Teste' } }];
      return single ? json(rows[0] || null, rows.length ? 200 : 406) : json(rows);
    }
    const pathname = url.pathname;
    const file = ['/', '/campeonatos', '/entrar'].includes(pathname) ? 'index.html' : pathname === `/c/${competitionId}` ? 'competition.html' : pathname.startsWith('/painel') ? 'panel.html' : pathname === '/demonstracao/copa-exemplo' ? 'complete-demo.html' : pathname.slice(1);
    const path = resolve(dist, file);
    if (!path.startsWith(dist + sep)) return route.abort();
    try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
    catch { return route.fulfill({ status: 404, body: 'Not found' }); }
  });
  return context;
}

try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    const context = await contextFor('empty', width);
    const page = await context.newPage();
    const errors = [];
    const demoWrites = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (!['GET', 'HEAD'].includes(request.method()) && /\/(?:rest\/v1|rpc)\//.test(request.url())) demoWrites.push(`${request.method()} ${request.url()}`); });
    await page.goto('http://tr.local/campeonatos', { waitUntil: 'networkidle' });
    await page.locator('.public-empty-state').waitFor();
    assert.equal(await page.locator('.public-competition-card').count(), 0);
    assert.equal(await page.locator('.public-demo-invite').count(), 1);
    assert.doesNotMatch(await page.locator('#campeonatos').innerText(), /modo real|0 equipes|0 partidas|0 resultados/i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `listagem vazia sem rolagem a ${width}px`);
    if ([390, 1440].includes(width)) await page.locator('#campeonatos').screenshot({ path: resolve(captureDir, `campeonatos-vazios-${width}.png`) });
    await page.locator('#open-portal').click();
    await page.waitForURL('**/demonstracao/copa-exemplo');
    await page.locator('#mata-mata').waitFor();
    assert.equal(await page.locator('#grupos .public-group-card').count(), 2);
    assert.equal(await page.locator('#equipes .public-team-card').count(), 8);
    assert.equal(await page.locator('#jogos .public-fixture').count(), 15);
    assert.equal(await page.locator('#mata-mata .public-fixture').count(), 3);
    assert.equal(await page.locator('.public-group-standings').count(), 2);
    assert.equal(await page.locator('main form').count(), 0);
    assert.deepEqual(demoWrites, [], 'a demonstração não escreve no backend oficial');
    const crests = await page.locator('#grupos img').evaluateAll((images) => images.map((image) => ({ loaded: image.complete && image.naturalWidth > 0, fit: getComputedStyle(image).objectFit })));
    assert.ok(crests.every((crest) => crest.loaded && crest.fit === 'contain'), `escudos fictícios íntegros a ${width}px`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `demonstração sem rolagem a ${width}px`);
    assert.deepEqual(errors, [], `sem erro de execução a ${width}px`);
    if ([390, 1440].includes(width)) {
      await page.locator('#grupos').screenshot({ path: resolve(captureDir, `grupos-${width}.png`) });
      await page.locator('#mata-mata').screenshot({ path: resolve(captureDir, `mata-mata-${width}.png`) });
    }
    if (width === 390) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const finalAccess = await page.evaluate(() => ({ button: document.querySelector('#mata-mata .public-knockout-phase:last-child .fixture-detail-link')?.getBoundingClientRect().bottom, nav: document.querySelector('.public-mobile-nav')?.getBoundingClientRect().top }));
      assert.ok(finalAccess.button < finalAccess.nav, 'botão da final acima da navegação fixa no fim da página');
      await page.locator('#mata-mata .public-knockout-phase:last-child .fixture-detail-link').click();
      await page.locator('.public-detail-page').waitFor();
      assert.equal(await page.locator('main form').count(), 0);
      assert.match(page.url(), /jogo=/);
      await page.locator('.back-link').click();
      await page.locator('#mata-mata').waitFor();
    }
    console.log(`${width}px: listagem vazia e demonstração completa OK`);
    await context.close();
  }

  for (const width of [320, 768, 1440]) {
    const context = await contextFor('published', width);
    const listing = await context.newPage();
    await listing.goto('http://tr.local/campeonatos', { waitUntil: 'networkidle' });
    await listing.locator('.public-competition-card').waitFor();
    assert.ok(await listing.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `lista publicada sem rolagem a ${width}px`);
    assert.equal(await listing.locator('.public-competition-card').count(), 1);
    if (width === 1440) await listing.locator('#campeonatos').screenshot({ path: resolve(captureDir, 'campeonato-publicado-1440.png') });
    await context.close();
  }
  const published = await contextFor('published');
  const page = await published.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://tr.local/campeonatos', { waitUntil: 'networkidle' });
  await page.locator('.public-competition-card').waitFor();
  assert.equal(await page.locator('.public-empty-state').count(), 0);
  assert.equal(await page.locator('.public-competition-card').count(), 1);
  assert.equal(await page.locator('.public-competition-card').getAttribute('href'), `/c/${competitionId}`);
  await page.locator('.public-competition-card').click();
  await page.waitForURL(`**/c/${competitionId}`);
  await page.locator('#classificacao').waitFor();
  assert.match(await page.locator('.public-hero h1').innerText(), /Copa Oficial de Teste/i);
  assert.equal(await page.locator('main form').count(), 0);
  assert.equal(await page.locator('#classificacao').locator('.standing-mobile-row').count(), 2);
  assert.equal(await page.locator('.public-featured .fixture-score').getAttribute('aria-label'), 'Placar 2 a 1');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__copiedPublicUrl = value; } } }); });
  await page.locator('#share-competition').click();
  assert.equal(await page.evaluate(() => window.__copiedPublicUrl), `http://tr.local/c/${competitionId}`);
  score = [1, 2];
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#classificacao').waitFor();
  assert.equal(await page.locator('.public-featured .fixture-score').getAttribute('aria-label'), 'Placar 1 a 2');
  assert.match(await page.locator('#classificacao .standing-mobile-row').first().innerText(), /União Metropolitana/i);
  await page.goto('http://tr.local/painel', { waitUntil: 'networkidle' });
  await page.waitForURL('**/entrar?retorno=*');
  assert.equal(await page.locator('.panel-layout').count(), 0);
  await page.goto(`http://tr.local/entrar?retorno=${encodeURIComponent(`/painel/campeonatos/${competitionId}`)}`, { waitUntil: 'networkidle' });
  await page.locator('#login-form input[name="email"]').fill('organizador@exemplo.invalid');
  await page.locator('#login-form input[name="password"]').fill('senha-ficticia');
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForURL(`**/painel/campeonatos/${competitionId}`);
  await page.locator('#copy-public-link').waitFor();
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__copiedPanelUrl = value; } } }); });
  await page.locator('#copy-public-link').click();
  assert.equal(await page.evaluate(() => window.__copiedPanelUrl), `http://tr.local/c/${competitionId}`);
  assert.match(await page.locator('#copy-public-status').innerText(), /copiado/i);
  assert.deepEqual(errors, []);
  await published.close();
  console.log('Publicação real simulada: link, leitura, resultado atualizado, compartilhamento, painel protegido e cópia no painel OK');

  const failed = await contextFor('error');
  const failedPage = await failed.newPage();
  await failedPage.goto('http://tr.local/campeonatos', { waitUntil: 'networkidle' });
  await failedPage.locator('.public-data-notice').waitFor();
  assert.equal(await failedPage.locator('.public-empty-state').count(), 0);
  assert.equal(await failedPage.locator('.public-competition-card').count(), 0);
  assert.match(await failedPage.locator('.public-data-notice').innerText(), /indisponíveis/);
  await failed.close();
  console.log('Falha de consulta distinguida de lista vazia OK');
} finally { await browser.close(); }

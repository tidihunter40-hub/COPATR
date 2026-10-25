import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const out = resolve('captures/platform-audit-2026-10-25/admin');
await mkdir(out, { recursive: true });
const user = { id: '0b0c0d0e-1111-4222-8333-444444444444', email: 'organizador@trcampeonatos.local', aud: 'authenticated', role: 'authenticated' };
const org = { id: '1b1c1d1e-2222-4333-8444-555555555555', name: 'TR Campeonatos' };
const comp = { id: '2b2c2d2e-3333-4444-8555-666666666666', organization_id: org.id, name: 'Copa de Teste Isolada', sport: 'Futebol', status: 'active', visibility: 'private' };
const season = { id: '3b3c3d3e-4444-4555-8666-777777777777', competition_id: comp.id, label: '2026', format: 'round_robin', status: 'active' };
const entries = [
  { id: '4b4c4d4e-5555-4666-8777-888888888881', club_id: '5b5c5d5e-6666-4777-8888-999999999991', club_name_snapshot: 'Galatasarrafo', status: 'confirmed' },
  { id: '4b4c4d4e-5555-4666-8777-888888888882', club_id: '5b5c5d5e-6666-4777-8888-999999999992', club_name_snapshot: 'Vibe E-Sports', status: 'confirmed' },
];
const matches = [{ id: '6b6c6d6e-7777-4888-8999-aaaaaaaaaaaa', season_id: season.id, phase: 'league', round_number: 1, scheduled_at: '2026-10-22T21:30:00Z', home_entry_id: entries[0].id, away_entry_id: entries[1].id, home_score: 3, away_score: 0, status: 'confirmed' }];
const writes = [];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const report = { cases: [], writes, errors: [] };
try {
  for (const width of [320, 375, 390, 430, 768, 820, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 780 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch: width <= 820 });
    await context.addInitScript(({ currentUser }) => {
      const project = 'zhoarvfjlbzzkhldfldd';
      localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({ access_token: 'admin-audit-token', refresh_token: 'admin-audit-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: currentUser }));
    }, { currentUser: user });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${width}px: ${error.message}`));
    await page.route('**/*supabase.co/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const table = url.pathname.split('/').pop();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.endsWith('/auth/v1/user')) return json(user);
      if (url.pathname.includes('/rest/v1/rpc/')) {
        const args = JSON.parse(request.postData() || '{}');
        writes.push({ width, type: 'rpc', name: table, args });
        if (table === 'create_competition_with_season') return json({ id: comp.id });
        if (table === 'set_match_result') { Object.assign(matches[0], { home_score: args.target_home_score, away_score: args.target_away_score, status: args.target_status }); return json(null); }
        return json(null);
      }
      if (url.pathname.includes('/rest/v1/')) {
        if (request.method() !== 'GET') {
          const args = JSON.parse(request.postData() || '{}');
          writes.push({ width, type: request.method(), name: table, args });
          if (table === 'clubs') return json({ id: '5b5c5d5e-6666-4777-8888-999999999993' }, 201);
          if (table === 'competition_entries') { entries.push({ id: crypto.randomUUID(), club_id: args.club_id, club_name_snapshot: args.club_name_snapshot, status: 'confirmed' }); return json({}, 201); }
          if (table === 'matches') { matches.push({ ...args, id: crypto.randomUUID(), phase: 'league', home_score: null, away_score: null }); return json({}, 201); }
          return json({}, 201);
        }
        const singular = (request.headers().accept || '').includes('application/vnd.pgrst.object+json');
        if (table === 'profiles') return json(singular ? { account_role: 'platform_admin', organizer_status: 'approved', display_name: 'Organizador de Teste' } : [{ account_role: 'platform_admin', organizer_status: 'approved', display_name: 'Organizador de Teste' }]);
        if (table === 'organization_members') return json([{ organization_id: org.id, role: 'owner', organizations: org }]);
        if (table === 'competitions') return json(singular ? comp : [comp]);
        if (table === 'competition_seasons') return json([season]);
        if (table === 'competition_entries') return json(entries);
        if (table === 'matches') return json(matches);
        if (table === 'clubs') return json([]);
        return json([]);
      }
      return json([]);
    });
    for (const [name, path, selector] of [
      ['dashboard', '/painel', '.metric-grid'],
      ['list', '/painel/campeonatos', '.competition-grid'],
      ['new', '/painel/campeonatos/novo', '#new-competition'],
      ['detail', `/painel/campeonatos/${comp.id}`, '#season-form'],
      ['results', `/painel/campeonatos/${comp.id}/resultados`, '#match-list .match-row'],
    ]) {
      try {
        const response = await page.goto(base + path, { waitUntil: 'networkidle' });
        await page.locator(selector).waitFor({ timeout: 10000, state: 'attached' });
        const geometry = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, visibleControls: [...document.querySelectorAll('main input, main select, main button')].filter(el => el.getBoundingClientRect().width > 0).length }));
        if (width === 390 && name === 'results') report.resultLayout = await page.evaluate(() => [...document.querySelectorAll('.match-row, .match-row .match-meta, .match-row form, .match-row form > *')].map(el => ({ tag: el.tagName, name: el.getAttribute('name'), text: el.textContent?.trim().slice(0, 30), className: el.className, rect: { x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width }, gridTemplateColumns: getComputedStyle(el).gridTemplateColumns, display: getComputedStyle(el).display })));
        report.cases.push({ width, name, status: response?.status(), ...geometry });
        if ([390, 820, 1440].includes(width)) await page.screenshot({ path: resolve(out, `${name}-${width}.png`), fullPage: true });
      } catch (error) { report.cases.push({ width, name, error: error.message }); }
    }
    if (width === 390) {
      await page.goto(base + '/painel/campeonatos/novo', { waitUntil: 'networkidle' });
      await page.locator('#new-competition input[name="name"]').fill(comp.name);
      await page.locator('#new-competition input[name="season"]').fill(season.label);
      await page.locator('#new-competition button[type="submit"]').click();
      await page.waitForURL(`**/painel/campeonatos/${comp.id}`);
      assert.ok(writes.some(item => item.type === 'rpc' && item.name === 'create_competition_with_season'));
      await page.goto(base + `/painel/campeonatos/${comp.id}/resultados`, { waitUntil: 'networkidle' });
      const resultForm = page.locator('.match-row form[data-match-id]');
      await resultForm.locator('input[name="home"]').fill('2');
      await resultForm.locator('input[name="away"]').fill('1');
      await resultForm.locator('button[type="submit"]').click();
      await page.locator('.match-row [role="status"]').filter({ hasText: 'Resultado salvo' }).waitFor();
      assert.ok(writes.some(item => item.type === 'rpc' && item.name === 'set_match_result' && item.args.target_home_score === 2 && item.args.target_away_score === 1));
      report.functional = { createCompetition: true, saveResult: true };
    }
    await context.close();
  }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  const failures = report.cases.filter(row => row.error || row.status !== 200 || row.viewport > row.width + 1 || row.documentWidth > row.width + 1);
  console.log(JSON.stringify({ cases: report.cases.length, failures: failures.length, examples: failures.slice(0, 8), functional: report.functional, errors: report.errors, writes: writes.length }, null, 2));
} finally { await browser.close(); }

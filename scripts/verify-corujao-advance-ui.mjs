import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const origin = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const out = 'captures/corujao-progression-2026-10-27';
await mkdir(out, { recursive: true });
const server = process.env.TR_QA_URL ? null
  : spawn(process.execPath, ['server.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
if (server) await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Servidor encerrou: ${code}`)));
});
const user = { id: '0b0c0d0e-1111-4222-8333-444444444444',
  email: 'organizador@trcampeonatos.local', aud: 'authenticated', role: 'authenticated' };
const org = { id: '1b1c1d1e-2222-4333-8444-555555555555', name: 'Organização de Teste' };
const competition = { id: '2b2c2d2e-3333-4444-8555-666666666666',
  organization_id: org.id, name: 'Corujão de Teste', sport: 'E-sports',
  status: 'active', visibility: 'private' };
const season = { id: '3b3c3d3e-4444-4555-8666-777777777777',
  competition_id: competition.id, label: '2026', format: 'groups_knockout',
  draw_kind: 'corujao', draw_confirmed_at: '2026-10-27T17:00:00Z', status: 'draft' };
const entries = Array.from({ length: 8 }, (_, index) => ({
  id: `4b4c4d4e-5555-4666-8777-${String(index + 1).padStart(12, '0')}`,
  club_id: `5b5c5d5e-6666-4777-8888-${String(index + 1).padStart(12, '0')}`,
  club_name_snapshot: `Equipe ${index + 1}`, status: 'confirmed',
}));
const matches = Array.from({ length: 12 }, (_, index) => ({
  id: `6b6c6d6e-7777-4888-8999-${String(index + 1).padStart(12, '0')}`,
  season_id: season.id, phase: 'groups', round_number: index % 3 + 1,
  home_entry_id: entries[index % 8].id,
  away_entry_id: entries[(index + 1) % 8].id,
  home_score: 1, away_score: 0, status: 'confirmed',
}));
const preview = {
  status: 'ready', phase: 'semifinal', revision: 'test-revision',
  fixtures: [
    { homeId: entries[0].id, awayId: entries[5].id },
    { homeId: entries[4].id, awayId: entries[1].id },
  ],
};
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const findings = [];
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      serviceWorkers: 'block', reducedMotion: 'reduce',
    });
    await context.addInitScript(({ currentUser }) => {
      localStorage.setItem('sb-zhoarvfjlbzzkhldfldd-auth-token', JSON.stringify({
        access_token: 'local-ui-token', refresh_token: 'local-ui-refresh',
        token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: currentUser,
      }));
    }, { currentUser: user });
    const page = await context.newPage();
    const calls = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*supabase.co/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const table = url.pathname.split('/').pop();
      const reply = (body) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(body),
      });
      if (url.pathname.endsWith('/auth/v1/user')) return reply(user);
      if (url.pathname.includes('/rest/v1/rpc/')) {
        const args = JSON.parse(request.postData() || '{}');
        calls.push({ name: table, args });
        if (table === 'corujao_advance_state') return reply(preview);
        if (table === 'confirm_corujao_advance') return reply({ status: 'created' });
        return reply(null);
      }
      if (url.pathname.includes('/rest/v1/')) {
        const singular = (request.headers().accept || '').includes('application/vnd.pgrst.object+json');
        if (table === 'profiles') return reply(singular
          ? { account_role: 'organizer', organizer_status: 'approved', display_name: 'Organizador' }
          : [{ account_role: 'organizer', organizer_status: 'approved', display_name: 'Organizador' }]);
        if (table === 'organization_members') return reply([{ organization_id: org.id,
          role: 'owner', organizations: org }]);
        if (table === 'competitions') return reply(singular ? competition : [competition]);
        if (table === 'competition_seasons') return reply([season]);
        if (table === 'competition_entries') return reply(entries);
        if (table === 'matches') return reply(matches);
        if (table === 'penalty_shootouts') return reply([]);
        return reply([]);
      }
      return reply([]);
    });
    page.on('dialog', (dialog) => dialog.accept());
    const response = await page.goto(
      `${origin}/painel/campeonatos/${competition.id}/resultados`,
      { waitUntil: 'networkidle', timeout: 30000 },
    );
    await page.locator('#confirm-corujao-advance').waitFor({ timeout: 10000 });
    const text = await page.locator('#corujao-progression').innerText();
    assert.match(text, /Fase de grupos concluída/);
    assert.match(text, /Equipe 1/);
    assert.match(text, /Equipe 6/);
    assert.equal(await page.locator('#corujao-progression li').count(), 2);
    const fixtureStyle = await page.locator('#corujao-progression li').first().evaluate((element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
      parentBackground: getComputedStyle(element.parentElement).backgroundColor,
    }));
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scrollWidth <= width + 1, `${width}: rolagem horizontal`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/organizador-${width}.png`,
      fullPage: true, animations: 'disabled' });
    if (width === 390) {
      const confirmation = page.waitForResponse((response) =>
        response.url().includes('/rpc/confirm_corujao_advance'));
      await page.locator('#confirm-corujao-advance').click();
      await confirmation;
      assert.ok(calls.some((call) => call.name === 'confirm_corujao_advance'
        && call.args.target_season === season.id
        && call.args.expected_revision === preview.revision));
    }
    findings.push({ width, status: response?.status(), scrollWidth,
      fixtures: 2, fixtureStyle, errors, confirmedByUi: width === 390 });
    await context.close();
  }
  await writeFile(`${out}/report.json`, JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings));
} finally {
  await browser.close();
  server?.kill();
}

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = (process.env.TR_QA_URL || 'http://127.0.0.1:45321').replace(/\/$/, '');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const output = new URL('../artifacts/painel/', import.meta.url);
const user = {
  id: '0b0c0d0e-1111-4222-8333-444444444444',
  email: 'organizador@trcampeonatos.local',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-10-23T00:00:00Z',
};
const organization = { id: '1b1c1d1e-2222-4333-8444-555555555555', name: 'TR Campeonatos' };

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: chrome, headless: true });

try {
  for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, celular: { width: 390, height: 844 }, celular_320: { width: 320, height: 568 } })) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await context.addInitScript(({ currentUser }) => {
      const project = 'zhoarvfjlbzzkhldfldd';
      localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({
        access_token: 'capture-only-token', refresh_token: 'capture-only-refresh', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: currentUser,
      }));
    }, { currentUser: user });
    const page = await context.newPage();
    await page.route('**/*supabase.co/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) });
      if (url.pathname.includes('/rest/v1/profiles')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ account_role: 'platform_admin', organizer_status: 'approved' }]) });
      if (url.pathname.includes('/rest/v1/organization_members')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ organization_id: organization.id, role: 'owner', organizations: organization }]) });
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    });
    await page.goto(`${base}/painel`, { waitUntil: 'networkidle' });
    await page.locator('.panel-layout').waitFor();
    await page.screenshot({ path: fileURLToPath(new URL(`painel-${name}.png`, output)), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}

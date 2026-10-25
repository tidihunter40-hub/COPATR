import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const dist = resolve('dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.jpe': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const id = '11111111-1111-4111-8111-111111111111';
const email = 'conta-de-teste@exemplo.invalid';
const password = 'segredo-temporario';
const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { name: 'Nome de Cadastro' }, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
const profile = { id, nickname: 'Falando Digital', display_name: 'Nome de Exibição', name: 'Nome do Perfil', account_role: 'organizer', organizer_status: 'approved' };
let valid = true;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const seenUrls = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    seenUrls.push(url.href);
    if (url.hostname !== 'tr.local') return route.abort();
    if (url.pathname === '/runtime-config.mjs') return route.fulfill({ contentType: 'text/javascript', body: `export const supabaseConfig = Object.freeze({url:'http://tr.local/mock',anonKey:'test-anon'});` });
    if (url.pathname.startsWith('/mock/')) {
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/mock/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const credentials = JSON.parse(request.postData() || '{}');
        assert.equal(credentials.email, email);
        assert.equal(credentials.password, password);
        valid = true;
        return json({ access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user });
      }
      if (url.pathname === '/mock/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') return valid ? json({ access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }) : json({ error: 'invalid_grant', message: 'Session expired' }, 401);
      if (url.pathname === '/mock/auth/v1/user') return valid ? json(user) : json({ code: 401, message: 'Session expired' }, 401);
      if (url.pathname === '/mock/auth/v1/logout') { valid = false; return route.fulfill({ status: 204, body: '' }); }
      if (url.pathname === '/mock/rest/v1/profiles') {
        if (!valid) return json({ message: 'Unauthorized' }, 401);
        if (request.method() === 'PATCH') { Object.assign(profile, JSON.parse(request.postData() || '{}')); return json(profile); }
        return request.headers().accept?.includes('application/vnd.pgrst.object+json') ? json(profile) : json([profile]);
      }
      return json([]);
    }
    const pathname = url.pathname;
    const file = pathname === '/entrar' || ['/', '/funcionalidades', '/como-funciona', '/campeonatos', '/planos'].includes(pathname) ? 'index.html' : pathname === '/painel' ? 'panel.html' : pathname === '/minha-conta' ? 'account.html' : pathname === '/demonstracao' ? 'interactive-demo.html' : pathname === '/demonstracao/copa-tr-esports' ? 'demo-competition.html' : pathname === '/planejador' ? 'competition-planner.html' : pathname.slice(1);
    const path = resolve(dist, file);
    if (!path.startsWith(dist + sep)) return route.abort();
    try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
    catch { return route.fulfill({ status: 404, body: 'Not found' }); }
  });
  const page = await context.newPage();
  const errors = [];
  const captureDir = resolve('captures', 'auth-header-2026-10-25');
  await mkdir(captureDir, { recursive: true });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://tr.local/', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.header-login:visible').count(), 1);
  assert.equal(await page.locator('.account-switcher:visible').count(), 0);
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.locator('.header-login:visible').count(), 1, `Entrar visível a ${width}px`);
    assert.equal(await page.locator('.header-cta:visible').count(), 1, `Começar agora visível a ${width}px`);
    const guestLayout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, menu: document.querySelector('.menu-toggle')?.getBoundingClientRect().toJSON() }));
    if (guestLayout.scroll > width) console.log('GUEST OVERFLOW', width, guestLayout);
    assert.ok(guestLayout.scroll <= width, `sem rolagem horizontal a ${width}px`);
    if (width === 320) await page.screenshot({ path: resolve(captureDir, 'cabecalho-visitante-320.png') });
  }
  await page.goto('http://tr.local/entrar?retorno=%2Fminha-conta', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#login-form').getAttribute('method'), 'post');
  assert.equal(await page.locator('#login-form:visible').count(), 1);
  await page.locator('#login-form input[name="email"]').fill(email);
  await page.locator('#login-form input[name="password"]').fill(password);
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForURL('**/minha-conta');
  await page.locator('.account-profile-identity strong').waitFor();
  assert.equal(await page.locator('.account-profile-identity strong').innerText(), profile.nickname);
  assert.ok(seenUrls.every((value) => !value.includes(email) && !value.includes(password)), 'credenciais não podem aparecer na URL');
  await page.goto('http://tr.local/', { waitUntil: 'networkidle' });
  await page.locator('.account-switcher:visible').waitFor();
  assert.equal(await page.locator('.account-name').innerText(), profile.nickname);
  assert.equal(await page.locator('.header-login:visible').count(), 0);
  assert.equal(await page.locator('.header-cta').innerText(), 'Meu painel');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.account-switcher:visible').waitFor();
  assert.equal(await page.locator('.account-name').innerText(), profile.nickname);
  await page.goto('http://tr.local/funcionalidades', { waitUntil: 'networkidle' });
  await page.locator('.account-switcher:visible').waitFor();
  await page.goto('http://tr.local/demonstracao', { waitUntil: 'networkidle' });
  await page.locator('.account-switcher:visible').waitFor();
  await page.goto('http://tr.local/minha-conta', { waitUntil: 'networkidle' });
  await page.locator('#account-profile-form input').fill('Novo Nome de Exibição');
  await page.locator('#account-profile-form button').click();
  assert.equal(await page.locator('#account-profile-status').innerText(), 'Nome atualizado.');
  await page.goto('http://tr.local/', { waitUntil: 'networkidle' });
  await page.locator('.account-trigger').click();
  assert.equal(await page.locator('.account-dropdown:visible').count(), 1);
  assert.equal(await page.locator('.account-dropdown a[href="/minha-conta"]').count(), 1);
  await page.locator('.account-trigger').click();
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, trigger: document.querySelector('.account-trigger')?.getBoundingClientRect().toJSON(), wide: [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(node).position !== 'absolute').slice(0, 10).map((node) => ({ tag: node.tagName, className: String(node.className).slice(0, 80), right: node.getBoundingClientRect().right })) }));
    if (dimensions.document > width) console.log('OVERFLOW', width, dimensions);
    assert.ok(dimensions.document <= width, `rolagem horizontal no cabeçalho a ${width}px`);
    assert.ok(dimensions.trigger && dimensions.trigger.right <= width && dimensions.trigger.left >= 0, `conta fora da tela a ${width}px`);
    if (width === 320) {
      await page.locator('.account-trigger').click();
      const menu = await page.locator('.account-dropdown').boundingBox();
      assert.ok(menu && menu.x >= 0 && menu.x + menu.width <= width, 'menu da conta inteiro no celular');
      assert.equal(await page.locator('.account-dropdown a:visible').count(), 2);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.account-dropdown:visible').count(), 0);
    }
    await page.screenshot({ path: resolve(captureDir, `cabecalho-logado-${width}.png`) });
  }
  await page.locator('.account-trigger').click();
  await page.locator('[data-sign-out]').click();
  await page.waitForURL('http://tr.local/');
  await page.locator('.header-login:visible').waitFor();
  assert.equal(await page.locator('.account-switcher:visible').count(), 0);
  await page.goto('http://tr.local/painel', { waitUntil: 'networkidle' });
  await page.waitForURL('**/entrar?retorno=*');
  assert.equal(await page.locator('#login-form:visible').count(), 1);
  await page.locator('#login-form input[name="email"]').fill(email);
  await page.locator('#login-form input[name="password"]').fill(password);
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForURL('**/painel');
  await page.goto('http://tr.local/', { waitUntil: 'networkidle' });
  await page.locator('.account-switcher:visible').waitFor();
  valid = false;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.header-login:visible').waitFor();
  assert.equal(await page.locator('.account-switcher:visible').count(), 0, 'a sessão expirada não deve manter o usuário no cabeçalho');
  await page.goto('http://tr.local/painel', { waitUntil: 'networkidle' });
  await page.waitForURL('**/entrar?retorno=*');
  assert.deepEqual(errors, []);
  console.log('Login, sessão, navegação, perfil, logout, expiração e proteção do painel OK');
  await context.close();
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  await noScript.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'tr.local') return route.abort();
    const file = url.pathname === '/entrar' ? 'index.html' : url.pathname.slice(1);
    const path = resolve(dist, file);
    try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
    catch { return route.fulfill({ status: 404, body: 'Not found' }); }
  });
  const offlinePage = await noScript.newPage();
  await offlinePage.goto('http://tr.local/entrar', { waitUntil: 'load' });
  assert.equal(await offlinePage.locator('#login-form:visible').count(), 0, 'sem JavaScript o formulário não pode enviar credenciais');
  await noScript.close();
  console.log('Formulário oculto sem JavaScript OK');
} finally { await browser.close(); }

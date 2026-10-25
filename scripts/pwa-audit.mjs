import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const out = resolve('captures/platform-audit-2026-10-25');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const report = { manifest: null, registration: null, cache: null, directEntry: null, update: null, offline: {}, standalone: null, errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  report.manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const response = await fetch(link.href);
    const manifest = await response.json();
    const icons = await Promise.all(manifest.icons.map(async icon => {
      const response = await fetch(icon.src);
      const bitmap = await createImageBitmap(await response.blob());
      return { ...icon, status: response.status, actual: `${bitmap.width}x${bitmap.height}` };
    }));
    return { ...manifest, icons };
  });
  assert.equal(report.manifest.name, 'TR Campeonatos');
  assert.equal(report.manifest.display, 'standalone');
  assert.equal(report.manifest.scope, '/');
  assert.ok(report.manifest.icons.some(icon => icon.sizes === '192x192' && icon.actual === '192x192' && icon.purpose === 'any'));
  assert.ok(report.manifest.icons.some(icon => icon.sizes === '512x512' && icon.actual === '512x512' && icon.purpose === 'maskable'));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  report.registration = await page.evaluate(async () => ({ controller: Boolean(navigator.serviceWorker.controller), scope: (await navigator.serviceWorker.ready).scope }));
  assert.ok(report.registration.controller);
  report.cache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.startsWith('tr-campeonatos-public-')));
    return { keys, entries: (await cache.keys()).map(request => new URL(request.url).pathname) };
  });
  assert.ok(report.cache.entries.includes('/demo-competition.html'));
  assert.ok(!report.cache.entries.some(path => ['/panel.html', '/account.html', '/competition.html', '/club.html', '/real-bootstrap.mjs'].includes(path)));
  await context.setOffline(true);
  for (const path of ['/', '/funcionalidades', '/demonstracao', '/demonstracao/copa-tr-esports', '/demonstracao/copa-exemplo', '/painel', '/minha-conta', '/c/00000000-0000-0000-0000-000000000000', '/campeonatos', '/entrar']) {
    const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 12000 });
    report.offline[path] = { status: response?.status(), title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 500) };
  }
  assert.equal(report.offline['/'].status, 200);
  assert.equal(report.offline['/funcionalidades'].status, 200);
  assert.equal(report.offline['/demonstracao'].status, 200);
  assert.equal(report.offline['/demonstracao/copa-tr-esports'].status, 200);
  assert.equal(report.offline['/demonstracao/copa-exemplo'].status, 200);
  assert.match(report.offline['/demonstracao/copa-tr-esports'].text, /COPA TR DEMONSTRAÇÃO 2026/);
  assert.doesNotMatch(report.offline['/demonstracao/copa-tr-esports'].text, /Carregando demonstração/);
  for (const path of ['/painel', '/minha-conta', '/c/00000000-0000-0000-0000-000000000000', '/campeonatos', '/entrar']) {
    assert.equal(report.offline[path].status, 503, `${path}: must not serve stale private or official data`);
    assert.match(report.offline[path].text, /requer conexão/);
  }
  await context.close();
  const directContext = await browser.newContext({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  const directPage = await directContext.newPage();
  await directPage.goto(base + '/demonstracao/copa-tr-esports', { waitUntil: 'networkidle' });
  await directPage.evaluate(() => navigator.serviceWorker.ready);
  report.directEntry = await directPage.evaluate(() => ({ manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'), controlled: Boolean(navigator.serviceWorker.controller) }));
  assert.equal(report.directEntry.manifest, '/manifest.webmanifest');
  await directPage.reload({ waitUntil: 'networkidle' });
  report.directEntry.controlled = await directPage.evaluate(() => Boolean(navigator.serviceWorker.controller));
  assert.ok(report.directEntry.controlled);
  await directContext.close();
  const updateContext = await browser.newContext();
  const updatePage = await updateContext.newPage();
  await updatePage.goto(base + '/rota-inexistente-para-auditoria', { waitUntil: 'domcontentloaded' });
  await updatePage.evaluate(async () => { await caches.open('tr-campeonatos-public-v47'); });
  await updatePage.goto(base + '/', { waitUntil: 'networkidle' });
  await updatePage.evaluate(() => navigator.serviceWorker.ready);
  await updatePage.waitForFunction(async () => !(await caches.keys()).includes('tr-campeonatos-public-v47'));
  report.update = await updatePage.evaluate(async () => ({ keys: await caches.keys(), oldCacheRemoved: !(await caches.keys()).includes('tr-campeonatos-public-v47') }));
  assert.ok(report.update.oldCacheRemoved);
  await updateContext.close();
  await writeFile(resolve(out, 'pwa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ manifest: report.manifest.name, registration: report.registration, directEntry: report.directEntry, update: report.update, cacheEntries: report.cache.entries.length, offline: report.offline, errors: report.errors }, null, 2));
} finally {
  await browser.close();
}

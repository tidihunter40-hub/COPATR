import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:45321/';
const out = resolve('captures/etapa-05');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 850 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width}: ${message.text()}`); });
    const response = await page.goto(`${base}campeonatos#galeria`, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(async () => {
      const trophy = document.querySelector('.champions-art img');
      const crest = document.querySelector('.champion-demo-card img');
      await Promise.all([trophy.decode(), crest.decode()]);
      const art = trophy.getBoundingClientRect();
      return {
        width: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        zoom: visualViewport.scale,
        trophy: { left: art.left, right: art.right, height: art.height, loaded: trophy.naturalWidth > 0 },
        crestLoaded: crest.naturalWidth > 0,
        officialCards: document.querySelectorAll('.champions-empty .champion-record').length,
        filtersHidden: document.querySelector('.champions-filters').hidden,
        demoText: document.querySelector('.champion-demo-card').innerText,
      };
    });
    assert.ok(report.pageWidth <= width + 1, `${width}px horizontal overflow: ${JSON.stringify(report)}`);
    assert.equal(report.zoom, 1);
    assert.ok(report.trophy.loaded && report.crestLoaded);
    assert.ok(report.trophy.left >= -1 && report.trophy.right <= width + 1, `${width}px trophy clipped: ${JSON.stringify(report)}`);
    assert.equal(report.officialCards, 0);
    assert.equal(report.filtersHidden, true);
    assert.match(report.demoText, /SIMULAÇÃO VISUAL — NÃO OFICIAL/);
    assert.match(report.demoText, /nenhum título atribuído/);
    assert.match(await page.locator('.champions-empty').innerText(), /O próximo capítulo da história ainda está sendo escrito/);
    assert.equal(await page.locator('.champions-primary').getAttribute('href'), '#champion-archive');
    assert.equal(await page.locator('.champions-demo-link').getAttribute('href'), '#demonstracao');
    if (width === 1440 || width === 375) {
      await page.locator('#galeria').screenshot({ path: resolve(out, width === 1440 ? '01-galeria-desktop-1440.png' : '02-galeria-celular-375.png'), animations: 'disabled' });
      if (width === 1440) await page.locator('.champions-stage').screenshot({ path: resolve(out, '03-trofeu-cenario-desktop.png'), animations: 'disabled' });
      await page.locator('.champion-demo-card').screenshot({ path: resolve(out, width === 1440 ? '04-cartao-demonstrativo-desktop.png' : '05-cartao-demonstrativo-celular.png'), animations: 'disabled' });
    }
    await page.locator('.champions-primary').click();
    assert.match(page.url(), /#champion-archive$/);
    await page.locator('.champion-demo-card a').click();
    assert.match(page.url(), /#clube-esports-galatasarrafo$/);
    await page.locator('.club-profile-stage04').waitFor();
    await page.goto(`${base}campeonatos#galeria`, { waitUntil: 'networkidle' });
    await page.locator('.champions-demo-link').click();
    assert.match(page.url(), /#demonstracao$/);
    console.log(`${width}px ${JSON.stringify(report)}`);
    await context.close();
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}campeonatos#galeria`, { waitUntil: 'networkidle' });
  const pwa = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const cache = await caches.open('tr-campeonatos-demo-v34');
    const asset = await cache.match('/assets/gallery-silver-trophy.webp');
    return { registered: Boolean(registration.active), keys, trophyCached: Boolean(asset) };
  });
  assert.ok(pwa.registered && pwa.trophyCached && pwa.keys.includes('tr-campeonatos-demo-v34'), `PWA: ${JSON.stringify(pwa)}`);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true, 'service worker controls the page');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.champions-art img').waitFor();
  const offline = await page.evaluate(async () => {
    const trophy = document.querySelector('.champions-art img');
    await trophy.decode();
    return { heading: document.querySelector('#champions-heading')?.textContent, trophyLoaded: trophy.naturalWidth > 0 };
  });
  assert.ok(offline.trophyLoaded && offline.heading?.includes('A GLÓRIA MERECE'), `Offline gallery: ${JSON.stringify(offline)}`);
  await context.close();
  console.log('Stage 05 gallery QA passed. PWA and offline gallery:', pwa, offline, 'Screenshots:', out);
} finally { await browser.close(); }

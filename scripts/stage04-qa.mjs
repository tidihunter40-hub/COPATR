import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('captures/etapa-04');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 850 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const writes = [];
    page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width}: ${message.text()}`); });
    page.on('request', (request) => { if (/\/rest\/v1\//.test(request.url()) && !['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    const response = await page.goto('http://127.0.0.1:45321/#clube-esports-galatasarrafo', { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    await page.locator('.club-profile-stage04 .trajectory-pitch').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('.club-profile-stage04 img.profile-crest')];
      await Promise.all(images.map((image) => image.decode()));
      return {
        viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
        scale: visualViewport.scale, phases: [...document.querySelectorAll('.trajectory-phases button')].map((button) => button.textContent.trim()),
        matches: document.querySelectorAll('.journey-select').length,
        fieldScore: document.querySelector('.pitch-score strong')?.textContent,
        broken: images.filter((image) => !image.naturalWidth || !image.naturalHeight).map((image) => image.src),
        stored: localStorage.getItem('tr-campeonatos-demo-v1'),
        selected: document.querySelector('.journey-select[aria-pressed="true"]')?.textContent,
      };
    });
    assert.ok(report.pageWidth <= width + 1, `${width}px overflow: ${JSON.stringify(report)}`);
    assert.equal(report.scale, 1);
    assert.equal(report.phases.length, 1, 'round robin must not invent knockout phases');
    assert.match(report.phases[0], /Pontos corridos/);
    assert.equal(report.matches, 5);
    assert.deepEqual(report.broken, []);
    assert.equal(report.stored, null, 'visual sample does not write to local laboratory');
    assert.match(await page.locator('.profile-history').innerText(), /Nenhum título oficial confirmado/);
    assert.match(await page.locator('.club-profile-stage04').innerText(), /SIMULAÇÃO VISUAL/);
    if (width === 1440 || width === 375) {
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = 'hidden'; });
      await page.locator('#club-profile-root').screenshot({ path: resolve(out, width === 1440 ? '01-perfil-desktop-1440.png' : '03-perfil-celular-375.png'), animations: 'disabled' });
      await page.locator('.trajectory-layout').screenshot({ path: resolve(out, width === 1440 ? '02-campo-trajetoria-desktop-1440.png' : '04-campo-trajetoria-celular-375.png'), animations: 'disabled' });
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = ''; });
    }
    const first = page.locator('.journey-select').first();
    const firstText = await first.innerText();
    await first.click();
    assert.equal(await first.getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('.trajectory-field-heading').innerText(), /Rodada 1/);
    assert.equal(await page.locator('.pitch-score strong').innerText(), 'VS');
    await page.locator('.pitch-club').last().click();
    assert.match(page.url(), /#clube-esports-/);
    await page.locator('.club-profile-stage04 .trajectory-pitch').waitFor();
    assert.deepEqual(writes, [], `${width}px attempted official write`);
    console.log(`${width}px: ${JSON.stringify({ ...report, firstText })}`);
    if (width === 1440) {
      await page.goto('http://127.0.0.1:45321/#galeria', { waitUntil: 'networkidle' });
      await page.locator('#galeria').screenshot({ path: resolve(out, '05-galeria-desktop-1440.png'), animations: 'disabled' });
      assert.equal(await page.locator('.champions-empty .champion-record').count(), 0, 'no fictional sample title is presented as official');
    }
    await context.close();
  }
  assert.deepEqual(errors, [], `Console errors: ${errors.join(' | ')}`);
  console.log('Stage 04 browser QA passed. Screenshots:', out);
} finally { await browser.close(); }

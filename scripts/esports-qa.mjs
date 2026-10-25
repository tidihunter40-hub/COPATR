import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('captures/etapa-03-3');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
try {
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width}: ${message.text()}`); });
    const response = await page.goto('http://127.0.0.1:45321/#previa-sistema', { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200);
    await page.locator('#home-standings tr').last().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const details = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('img.home-crest-esports')];
      await Promise.all(images.map((image) => image.decode()));
      const next = document.querySelector('#home-next-matches');
      const table = document.querySelector('.home-table-scroll');
      return {
        viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
        upcoming: next.querySelectorAll('.home-fixture').length,
        uniqueUpcoming: [...new Set([...next.querySelectorAll('img.home-crest-esports')].map((image) => image.getAttribute('src')))].length,
        standings: document.querySelectorAll('#home-standings tr').length,
        broken: images.filter((image) => !image.naturalWidth || !image.naturalHeight).map((image) => image.src),
        fit: [...new Set(images.map((image) => getComputedStyle(image).objectFit))],
        crestWidth: next.querySelector('img.home-crest-esports').getBoundingClientRect().width,
        nameSize: parseFloat(getComputedStyle(next.querySelector('.home-fixture-side')).fontSize),
        tableWidth: table.clientWidth, tableScrollWidth: table.scrollWidth,
        stored: localStorage.getItem('tr-campeonatos-demo-v1'),
      };
    });
    assert.ok(details.pageWidth <= width + 1, `${width}px page overflow: ${JSON.stringify(details)}`);
    assert.equal(details.upcoming, 3);
    assert.equal(details.uniqueUpcoming, 6);
    assert.equal(details.standings, 6);
    assert.deepEqual(details.broken, []);
    assert.deepEqual(details.fit, ['contain']);
    assert.equal(details.stored, null, 'visual scenario does not write laboratory state');
    if (width === 1440) {
      assert.ok(details.crestWidth >= 64 && details.crestWidth <= 80, JSON.stringify(details));
      assert.ok(details.tableScrollWidth <= details.tableWidth + 1, JSON.stringify(details));
    }
    if (width === 375 || width === 1440) {
      await page.locator('.home-device-frame').screenshot({ path: resolve(out, width === 1440 ? '01-desktop-1440.png' : '02-celular-375.png'), animations: 'disabled' });
    }
    if (width === 1440) {
      await page.locator('.home-matches-card').screenshot({ path: resolve(out, '03-confrontos-seis-escudos.png'), animations: 'disabled' });
      await page.locator('.home-standings-card').screenshot({ path: resolve(out, '04-classificacao-seis-escudos.png'), animations: 'disabled' });
      for (const id of ['quack', 'galatasarrafo', 'vibe', 'facao', 'underdogs', 'maquina']) {
        await page.evaluate((clubId) => { location.hash = `#clube-esports-${clubId}`; }, id);
        await page.locator('.club-profile .profile-hero-crest').waitFor();
        assert.match(await page.locator('.club-profile').innerText(), /SIMULAÇÃO VISUAL/);
        assert.equal(await page.locator('.club-profile .profile-hero-crest').evaluate((image) => image.complete && image.naturalWidth > 0), true);
      }
      await page.locator('.profile-back').click();
      await page.locator('.home-preview-switch a').click();
      await page.waitForFunction(() => document.querySelector('#showcase-tab-matches')?.getAttribute('aria-selected') === 'true');
      assert.equal(await page.locator('#showcase-tab-matches').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#showcase-panel .showcase-match').count(), 15, 'calendar by round shows all fixtures');
      await page.locator('#showcase-tab-standings').click();
      assert.equal(await page.locator('#showcase-panel .showcase-table tbody tr').count(), 6);
      await page.locator('#showcase-tab-championships').click();
      assert.equal(await page.locator('#showcase-panel .roster-items .demo-crest-esports').count(), 6);
    }
    console.log(`${width}px ${JSON.stringify(details)}`);
    await context.close();
  }
  assert.deepEqual(errors, [], `Console errors: ${errors.join(' | ')}`);
  console.log('Esports visual QA passed. Screenshots:', out);
} finally {
  await browser.close();
}

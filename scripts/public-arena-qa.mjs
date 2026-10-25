import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('captures/arena-publica-2026-10-23');
const base = `http://127.0.0.1:${process.env.PORT || 45321}/demonstracao/copa-tr-esports`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
try {
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    const mobile = width <= 430;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${width}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${width}: ${message.text()}`); });
    const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
    assert.equal(response?.status(), 200);
    await page.locator('.public-featured .match-arena').waitFor();
    await page.evaluate(() => { for (const img of document.images) img.loading = 'eager'; });
    await page.waitForTimeout(300);
    const report = await page.evaluate(() => ({
      width: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(img => !img.naturalWidth).map(img => img.src),
      fixtures: document.querySelectorAll('#jogos .match-arena').length,
      crestWidths: [...document.querySelectorAll('.public-featured .fixture-crest-frame')].map(el => Math.round(el.getBoundingClientRect().width)),
      navVisible: getComputedStyle(document.querySelector('.public-mobile-nav')).display !== 'none',
      standingRows: document.querySelectorAll('.standing-mobile-row').length,
    }));
    assert.ok(report.pageWidth <= width + 1, `${width}px overflow: ${JSON.stringify(report)}`);
    assert.deepEqual(report.brokenImages, [], `${width}px broken image`);
    assert.equal(report.fixtures, 15);
    assert.equal(report.standingRows, 6);
    assert.equal(report.navVisible, width <= 760);
    assert.ok(Math.min(...report.crestWidths) >= (mobile ? 75 : 105), `${width}px crests too small: ${JSON.stringify(report)}`);
    if (mobile) {
      const details = page.locator('.standing-mobile-row.standing-leader details');
      await details.locator('summary').click();
      assert.equal(await details.evaluate(el => el.open), true);
      assert.match(await details.innerText(), /Aproveitamento|Últimos resultados|Histórico disponível/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow after expansion`);
      if (width === 390) await page.locator('#classificacao').screenshot({ path: resolve(out, 'classificacao-mobile-390-expandida.png'), animations: 'disabled' });
      await details.locator('summary').click();
    } else {
      const button = page.locator('.standings-scroll .standing-expand').first();
      await button.click();
      assert.equal(await button.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#standing-detail-0').isVisible(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow after expansion`);
      if (width === 1440) await page.locator('#classificacao').screenshot({ path: resolve(out, 'classificacao-desktop-1440-expandida.png'), animations: 'disabled' });
      await button.click();
    }
    const name = mobile ? `mobile-${width}` : `desktop-${width}`;
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: resolve(out, `inicio-${name}.png`), animations: 'disabled' });
      await page.locator('#jogos').screenshot({ path: resolve(out, `jogos-${name}.png`), animations: 'disabled' });
      await page.locator('#classificacao').screenshot({ path: resolve(out, `classificacao-${name}.png`), animations: 'disabled' });
      if (mobile) {
        await page.locator('.fixture-filter[data-filter="results"]').click();
        assert.equal(await page.locator('#jogos .match-arena:visible').count(), 3);
        await page.locator('.fixture-filter[data-filter="upcoming"]').click();
        assert.equal(await page.locator('#jogos .match-arena:visible').count(), 12);
        await page.locator('.fixture-filter[data-filter="all"]').click();
        await page.locator('#round-filter').selectOption('1');
        assert.equal(await page.locator('#jogos .match-arena:visible').count(), 3);
        await page.locator('#round-filter').selectOption('all');
      }
      const matchUrl = await page.locator('.public-featured .fixture-detail-link').getAttribute('href');
      await page.goto(new URL(matchUrl, base).href, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.locator('.public-detail-page .match-arena').waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.public-detail-page .match-arena img')].every(img => img.complete && img.naturalWidth > 0));
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(out, `detalhes-${name}.png`), animations: 'disabled' });
      assert.equal(await page.locator('.public-mobile-nav').isVisible(), mobile);
    }
    console.log(JSON.stringify(report));
    await context.close();
  }
  assert.deepEqual(errors, [], errors.join(' | '));
  console.log(`Capturas: ${out}`);
} finally {
  await browser.close();
}

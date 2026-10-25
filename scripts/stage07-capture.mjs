import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const output = resolve('captures/etapa-07/homepage');
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
await mkdir(output, { recursive: true });

try {
  for (const { name, width, height } of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
    const response = await page.goto('http://127.0.0.1:45321/', { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    await page.locator('#showcase-tab-dashboard').waitFor();
    await page.waitForFunction(() => globalThis.TRPublicHomeData !== undefined);
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = 'eager';
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    const report = await page.evaluate(() => {
      const hero = document.querySelector('#inicio');
      const logo = document.querySelector('.hero-brand img');
      const content = document.querySelector('.hero-content').getBoundingClientRect();
      const brand = document.querySelector('.hero-brand').getBoundingClientRect();
      const sports = document.querySelector('.hero-sports').getBoundingClientRect();
      const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      return {
        viewport: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        zoom: visualViewport.scale,
        heroHeight: Math.round(hero.getBoundingClientRect().height),
        backgroundPosition: getComputedStyle(hero).backgroundPosition,
        logoRatio: logo.getBoundingClientRect().width / logo.getBoundingClientRect().height,
        logoNaturalRatio: logo.naturalWidth / logo.naturalHeight,
        logoLoaded: logo.naturalWidth > 0,
        overlaps: { contentBrand: overlaps(content, brand), brandSports: overlaps(brand, sports) },
        brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')),
      };
    });
    assert.ok(report.pageWidth <= width + 1, `${name}: horizontal overflow ${JSON.stringify(report)}`);
    assert.equal(report.zoom, 1);
    assert.ok(report.logoLoaded && Math.abs(report.logoRatio - report.logoNaturalRatio) < .02, `${name}: distorted logo`);
    assert.deepEqual(report.overlaps, { contentBrand: false, brandSports: false }, `${name}: hero overlap`);
    assert.deepEqual(report.brokenImages, [], `${name}: broken image`);
    assert.ok(report.heroHeight >= (name === 'desktop' ? 550 : 700), `${name}: hero too short to reveal field`);
    await page.screenshot({ path: resolve(output, `home-${name}.png`), animations: 'disabled' });
    await page.screenshot({ path: resolve(output, `home-${name}-completa.png`), fullPage: true, animations: 'disabled' });
    for (const link of await page.locator('.hero-actions a').all()) {
      assert.equal(await link.getAttribute('href'), '#demonstracao');
      await link.click();
      assert.match(page.url(), /#demonstracao$/);
      await page.goto('http://127.0.0.1:45321/', { waitUntil: 'domcontentloaded' });
    }
    console.log(`${name}: ${JSON.stringify(report)}`);
    await context.close();
  }
  assert.deepEqual(errors, [], `Console errors: ${errors.join(' | ')}`);
  console.log(`Four Stage 07 screenshots captured in ${output}`);
} finally { await browser.close(); }

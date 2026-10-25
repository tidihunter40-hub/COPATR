import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const phase = process.argv[2];
assert.ok(['antes', 'depois'].includes(phase), 'Use antes ou depois.');
const base = `http://127.0.0.1:${process.env.PORT || 47777}`;
const out = resolve('captures/hero-logo-2026-10-24');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const result = [];
try {
  for (const [width, dpr] of [[390, 2], [768, 2], [1440, 1], [1920, 1], [2560, 1], [3840, 1]]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: dpr, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 20000 });
    assert.equal(response?.status(), 200);
    await page.locator('#inicio .hero-brand img').waitFor({ state: 'visible' });
    await page.waitForFunction(() => { const img = document.querySelector('#inicio .hero-brand img'); return img?.complete && img.naturalWidth > 0; });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => {
      const img = document.querySelector('#inicio .hero-brand img');
      const box = img.getBoundingClientRect();
      return { source: img.getAttribute('src'), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, renderedWidth: box.width, renderedHeight: box.height, overflow: document.documentElement.scrollWidth - innerWidth, filter: getComputedStyle(img.parentElement).filter, blend: getComputedStyle(img).mixBlendMode };
    });
    assert.ok(metrics.overflow <= 1, `${width}px: rolagem horizontal`);
    metrics.sourcePixelsPerDisplayPixel = Math.round(metrics.naturalWidth / (metrics.renderedWidth * dpr) * 100) / 100;
    if (phase === 'depois') assert.ok(metrics.sourcePixelsPerDisplayPixel >= 1, `${width}px: imagem ampliada além da resolução original`);
    if ([390, 1440, 2560, 3840].includes(width)) await page.locator('#inicio').screenshot({ path: resolve(out, `${phase}-hero-${width}.png`), animations: 'disabled', timeout: 15000 });
    result.push({ width, dpr, ...metrics });
    await context.close();
  }
  await writeFile(resolve(out, `${phase}-medidas.json`), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}

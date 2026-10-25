import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox } from 'playwright-core';

const base = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const out = resolve('captures/platform-audit-2026-10-25/browsers');
await mkdir(out, { recursive: true });
const specs = [
  ['edge', chromium, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
  ['firefox', firefox, 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'],
];
const report = { browsers: [] };
for (const [name, engine, executablePath] of specs) {
  const result = { name, cases: [], launchError: null };
  report.browsers.push(result);
  let browser;
  try { browser = await engine.launch({ executablePath, headless: true, timeout: 15000 }); }
  catch (error) { result.launchError = error.message; continue; }
  try {
    for (const width of [320, 390, 820, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width < 500 ? 780 : 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const [routeName, path, selector] of [
        ['home', '/', '.site-header'],
        ['portal', '/demonstracao/copa-tr-esports', '.public-featured .match-arena'],
      ]) {
        try {
          const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.locator(selector).waitFor({ timeout: 12000 });
          const geometry = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, brokenImages: [...document.images].filter(img => img.complete && !img.naturalWidth && img.getBoundingClientRect().width > 0).length }));
          result.cases.push({ width, routeName, status: response?.status(), ...geometry, errors: [...errors] });
          if (width === 390 && routeName === 'portal') await page.screenshot({ path: resolve(out, `${name}-portal-390.png`) });
        } catch (error) { result.cases.push({ width, routeName, error: error.message, errors: [...errors] }); }
      }
      try {
        const href = await page.locator('.public-featured .fixture-detail-link').getAttribute('href');
        const response = await page.goto(base + href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.locator('.public-detail-page .match-detail-arena').waitFor({ timeout: 12000 });
        const detail = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, names: [...document.querySelectorAll('.public-detail-page .fixture-team-name')].map(el => el.textContent.trim()), edits: document.querySelectorAll('.public-detail-page input, .public-detail-page button, .public-detail-page form').length }));
        result.cases.push({ width, routeName: 'detail', status: response?.status(), ...detail, errors: [...errors] });
        if (width === 390) await page.locator('.public-detail-page').screenshot({ path: resolve(out, `${name}-detail-390.png`) });
      } catch (error) { result.cases.push({ width, routeName: 'detail', error: error.message, errors: [...errors] }); }
      await context.close();
    }
  } finally { await browser.close(); }
}
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browsers.map(browser => ({ name: browser.name, cases: browser.cases.length, launchError: browser.launchError?.slice(0, 300), failures: browser.cases.filter(row => row.error || row.status !== 200 || row.documentWidth > row.width + 1 || row.viewport > row.width + 1 || row.brokenImages || row.errors?.length).length })), null, 2));

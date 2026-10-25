import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.TR_QA_URL || 'https://copatr.vercel.app';
const out = resolve('captures/home-art-direction-2026-10-25');
const widths = [320, 360, 375, 390, 430, 768, 820, 1024, 1440, 1920];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const report = { base, widths, cases: [] };

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 780 : 1000 }, isMobile: width <= 480, hasTouch: width <= 834, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
    await Promise.all(['.feature-editorial', '.sports-atlas', '.legacy-club-card', '.footer-cta'].map(selector => page.locator(selector).waitFor({ timeout: 15000 })));
    const volleyball = page.locator('.sport-atlas-card').filter({ hasText: 'Vôlei' });
    await volleyball.click();
    await page.waitForTimeout(80);
    const facts = await page.evaluate(() => {
      const visible = element => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0; };
      const overflow = [...document.body.querySelectorAll('*')].filter(visible).filter(element => { const style = getComputedStyle(element); const box = element.getBoundingClientRect(); const parent = element.parentElement; const parentStyle = parent && getComputedStyle(parent); return style.pointerEvents !== 'none' && (box.left < -2 || box.right > innerWidth + 2) && !['auto', 'scroll'].includes(parentStyle?.overflowX); }).slice(0, 8).map(element => element.className || element.tagName);
      return { documentWidth: document.documentElement.scrollWidth, viewport: innerWidth, overflow, spotlight: document.querySelector('.sport-spotlight')?.textContent || '', selected: document.querySelector('.sport-atlas-card[aria-pressed="true"]')?.textContent || '', imageErrors: [...document.images].filter(image => image.complete && !image.naturalWidth && visible(image)).map(image => image.src) };
    });
    if ([390, 820, 1440].includes(width)) await page.screenshot({ path: resolve(out, `redesign-${width}.png`), fullPage: true, animations: 'disabled' });
    report.cases.push({ width, status: response?.status(), ...facts, errors });
    await context.close();
  }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  const failures = report.cases.filter(row => row.status !== 200 || row.documentWidth > row.viewport + 1 || row.overflow.length || row.imageErrors.length || row.errors.length || !/Sets, critérios específicos/.test(row.spotlight) || !/Vôlei/.test(row.selected));
  console.log(JSON.stringify({ cases: report.cases.length, failures: failures.length, examples: failures.slice(0, 5), out }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}

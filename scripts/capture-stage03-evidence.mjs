import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = (process.env.TR_QA_URL || 'http://127.0.0.1:45321').replace(/\/$/, '');
const output = resolve('captures/etapa03');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

async function prepare(page) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const image of document.images) image.loading = 'eager';
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await prepare(desktop);
  await desktop.screenshot({ path: resolve(output, 'homepage-desktop.png'), fullPage: true, animations: 'disabled' });
  await desktop.locator('.hero-sports').screenshot({ path: resolve(output, 'painel-modalidades.png'), animations: 'disabled' });
  await desktop.locator('.home-route-cards').screenshot({ path: resolve(output, 'cards-inferiores.png'), animations: 'disabled' });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await prepare(mobile);
  await mobile.screenshot({ path: resolve(output, 'homepage-mobile.png'), fullPage: true, animations: 'disabled' });
  console.log(`Evidências salvas em ${output}`);
} finally {
  await browser.close();
}

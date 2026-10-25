import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const width = Number(process.argv[2] || 1440);
const height = width <= 430 ? 844 : 900;
const url = process.env.TR_QA_URL || 'http://127.0.0.1:45322/';
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(`homepage-${width}.png`), animations: 'disabled' });
  console.log(`Homepage captured at ${width}px.`);
} finally {
  await browser.close();
}

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const assets = [
  ['football.png', 'football.webp'],
  ['futsal.png', 'futsal.webp'],
  ['volleyball.png', 'volleyball.webp'],
  ['basketball.png', 'basketball.webp'],
  ['esports.png', 'esports.webp'],
  ['championship-trophy-banner.png', 'championship-trophy-banner.webp'],
  ['functionality-card-reference.png', 'functionality-card-reference.webp'],
  ['championship-card-reference.png', 'championship-card-reference.webp'],
  ['demo-card-reference.png', 'demo-card-reference.webp'],
];

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

try {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  for (const [source, target] of assets) {
    const dataUrl = await page.evaluate(async (path) => {
      const image = new Image();
      image.src = `/assets/home/${path}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.9);
    }, source);
    await writeFile(resolve('dist/assets/home', target), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`Converted ${source} to ${target}`);
  }
} finally {
  await browser.close();
}

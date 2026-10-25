import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
await page.goto('http://127.0.0.1:45321/?debug=320', { waitUntil: 'networkidle' });
console.log(await page.evaluate(() => Object.fromEntries(['.tr-classification', '.tr-classification-side', '.tr-classification-main', '.tr-classification-top', '.tr-competition-select', '.tr-side-nav'].map((selector) => { const e = document.querySelector(selector); const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return [selector, { left:r.left, right:r.right, width:r.width, display:s.display, grid:s.gridTemplateColumns, padding:s.padding, minWidth:s.minWidth, overflow:s.overflowX }]; }))));
await browser.close();

import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  for (const width of [320, 360, 375, 390, 393, 412, 430, 480]) {
    const context = await browser.newContext({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:45321/', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(() => ({ innerWidth, scrollWidth: document.documentElement.scrollWidth, parts: [...document.querySelectorAll('.site-header, .site-header .brand, .site-header .header-actions, .site-header .header-actions > *, .site-header .menu-toggle')].map(el => ({ selector: el.className, text: el.textContent.trim().slice(0, 18), rect: { left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width }, display: getComputedStyle(el).display })) }));
    console.log(JSON.stringify({ width, ...result }));
    await context.close();
  }
} finally { await browser.close(); }

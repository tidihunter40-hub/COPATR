import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const response = await page.goto('http://127.0.0.1:45321/campeonatos', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.TRPublicHomeData), null, { timeout: 15000 });
  const summary = await page.evaluate(() => ({
    status: window.TRPublicHomeData.competitionsStatus,
    count: window.TRPublicHomeData.competitions.length,
    ids: window.TRPublicHomeData.competitions.map(item => item.id),
  }));
  console.log(JSON.stringify({ httpStatus: response?.status(), status: summary.status, publishedCount: summary.count }));
  if (summary.ids.length) {
    await page.goto(`http://127.0.0.1:45321/c/${summary.ids[0]}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.public-shell').waitFor({ timeout: 15000 });
    const firstDetail = page.locator('.public-fixture .fixture-detail-link').first();
    if (await firstDetail.count()) {
      await firstDetail.click();
      await page.locator('.public-detail-page .match-arena').waitFor({ timeout: 15000 });
      console.log(JSON.stringify({ publicDetail: 'loaded', loginRequired: page.url().includes('/entrar'), editControls: await page.locator('.public-detail-page form, .public-detail-page input, .public-detail-page button').count() }));
    }
  }
} finally {
  await browser.close();
}

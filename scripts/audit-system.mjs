import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const widths = [320, 375, 390, 768, 1024, 1280, 1440, 1920];
const pages = ['dashboard', 'championships', 'teams', 'players', 'matches', 'classification', 'bracket', 'stats', 'champions', 'settings'];
const errors = [];

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width}px: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`${width}px: ${error.message}`));
    const response = await page.goto('http://127.0.0.1:45321/?audit=system', { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, `${width}px: aplicação indisponível`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      const visibleImages = [...document.images].filter((image) => image.getClientRects().length && getComputedStyle(image).visibility !== 'hidden');
      await Promise.all(visibleImages.map((image) => image.decode().catch(() => {})));
    });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter((image) => image.getClientRects().length && getComputedStyle(image).visibility !== 'hidden' && (!image.complete || image.naturalWidth === 0)).map((image) => image.src),
      clipped: [...document.querySelectorAll('.tr-classification *')].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.position !== 'fixed' && rect.right > innerWidth + 2 && style.overflowX !== 'auto' && !element.closest('.tr-standings-card, .tr-bracket');
      }).slice(0, 8).map((element) => element.className || element.tagName),
    }));
    assert.ok(layout.scrollWidth <= layout.viewport + 1, `${width}px: rolagem horizontal global`);
    assert.deepEqual(layout.brokenImages, [], `${width}px: imagens quebradas`);
    assert.deepEqual(layout.clipped, [], `${width}px: componentes excedem a viewport: ${layout.clipped.join(', ')}`);
    for (const systemPage of pages) {
      await page.locator(`[data-tr-page="${systemPage}"]`).click();
      if (systemPage === 'classification') {
        await page.locator('.tr-standings-card tbody tr').first().click();
        assert.match(await page.locator('.tr-team-hero').innerText(), /Falcões FC/i, `${width}px: seleção da equipe`);
      } else {
        await page.locator('.tr-page').waitFor();
        assert.ok((await page.locator('.tr-page h1').innerText()).length > 2, `${width}px: título ausente em ${systemPage}`);
      }
    }
    if (width === 1440 || width === 390) await page.screenshot({ path: resolve(`audit-system-${width}.png`), fullPage: true, animations: 'disabled' });
    await context.close();
    console.log(`${width}px: navegação, classificação, imagens e layout aprovados`);
  }
  assert.deepEqual(errors, [], `Erros no console: ${errors.join(' | ')}`);
  console.log('Auditoria de viewport concluída sem erros de console.');
} finally {
  await browser.close();
}

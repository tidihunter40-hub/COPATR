import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const url = process.env.TR_QA_URL || 'http://127.0.0.1:45322/';
const defaultWidths = [320, 375, 390, 768, 1024, 1440];
const widths = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!widths.length) widths.push(...defaultWidths);
const errors = [];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: 1 });
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width}px: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`${width}px: ${error.message}`));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = 'eager';
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    });
    const report = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      brokenImages: [...document.images].filter((image) => image.getClientRects().length && (!image.complete || image.naturalWidth === 0)).map((image) => image.src),
    }));
    assert.ok(report.pageWidth <= report.viewport + 1, `${width}px: rolagem horizontal global`);
    assert.deepEqual(report.brokenImages, [], `${width}px: imagem quebrada`);
    assert.equal(await page.locator('.hero-sport-card').count(), 6, `${width}px: seis modalidades`);
    assert.match(await page.locator('.hero-live').innerText(), /SIMULAÇÃO VISUAL/i, `${width}px: placar identificado`);
    assert.equal(await page.locator('.home-route-card').count(), 3, `${width}px: três cards inferiores`);
    assert.equal(await page.locator('.home-route-card a[href="/demonstracao"]').count(), 1, `${width}px: CTA do laboratório`);
    await page.locator('.hero-sport-card[data-sport="Futebol"]').click();
    await page.locator('.sport-card.selected').waitFor();
    assert.match(await page.locator('.sport-card.selected').innerText(), /Futebol/i, `${width}px: Futebol selecionado`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.hero-sports-heading a').click();
    await page.waitForURL(/\/funcionalidades#modalidades$/);
    await page.locator('#modalidades').waitFor();
    await page.close();
    console.log(`${width}px: layout, modalidades e rotas aprovados`);
  }
  assert.deepEqual(errors, [], `Erros no console: ${errors.join(' | ')}`);
  console.log('Etapa 02 validada sem erros de console.');
} finally {
  await browser.close();
}

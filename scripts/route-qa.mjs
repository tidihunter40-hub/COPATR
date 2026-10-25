import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:45322';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const routes = ['/', '/funcionalidades', '/como-funciona', '/campeonatos', '/demonstracao', '/planos', '/entrar'];
const errors = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`));
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200, `${route} HTTP`);
      const visible = await page.locator('main > section:visible').count();
      assert.ok(visible >= 1, `${route} sem conteúdo visível`);
      assert.ok(await page.locator('.main-nav a[aria-current="page"]').count() === (route === '/entrar' ? 0 : 1), `${route} menu ativo`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${route} ${width}px excede ${overflow}px`);
    }
    await context.close();
  }
  assert.deepEqual(errors, [], 'erros JavaScript');
  console.log(`${routes.length * 2} combinações de rota/viewport verificadas.`);
} finally { await browser.close(); }

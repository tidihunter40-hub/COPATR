import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:45322';
const output = resolve('captures/auditoria-geral');
await mkdir(output, { recursive: true });
const routes = [
  ['home', '/'], ['funcionalidades', '/funcionalidades'], ['como-funciona', '/como-funciona'],
  ['campeonatos', '/campeonatos'], ['demonstracao', '/demonstracao'], ['planos', '/planos'], ['entrar', '/entrar'],
];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const errors = [];
try {
  for (const [size, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${size}: ${error.message}`));
    for (const [name, path] of routes) {
      const response = await page.goto(base + path, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200, `${path}: HTTP`);
      await page.evaluate(() => document.fonts.ready);
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(horizontalOverflow <= 1, `${name} ${size}: rolagem horizontal (${horizontalOverflow}px)`);
      await page.screenshot({ path: resolve(output, `${name}-${size}.png`), fullPage: true });
      if (name === 'home') {
        assert.equal(await page.locator('.hero:visible').count(), 1, 'hero visível');
        assert.equal(await page.locator('#previa-sistema:visible').count(), 0, 'prévia administrativa ausente da homepage');
      }
      if (name === 'demonstracao') {
        assert.equal(await page.locator('#lab-app:visible').count(), 1, 'laboratório preservado');
      }
      if (name === 'entrar') {
        await page.locator('#signup-toggle').click();
        assert.equal(await page.locator('input[name="display_name"]:visible').count(), 1, 'cadastro de conta disponível');
        await page.locator('#signup-toggle').click();
        assert.equal(await page.locator('input[name="display_name"]').count(), 0, 'retorno ao login');
      }
    }
    const protectedResponse = await page.goto(base + '/painel', { waitUntil: 'networkidle' });
    assert.equal(protectedResponse?.status(), 200, 'rota protegida entrega shell');
    await page.waitForURL(/\/entrar\?retorno=/);
    assert.equal(await page.locator('#login-form:visible').count(), 1, 'usuário sem sessão redirecionado ao login');
    const publicResponse = await page.goto(base + '/c/00000000-0000-0000-0000-000000000000', { waitUntil: 'networkidle' });
    assert.equal(publicResponse?.status(), 200, 'URL pública estável entrega shell');
    assert.equal(await page.getByText('Campeonato não encontrado').count(), 1, 'sem dados fictícios em URL inexistente');
    await page.screenshot({ path: resolve(output, `campeonato-nao-encontrado-${size}.png`), fullPage: true });
    const clubResponse = await page.goto(base + '/clubes/00000000-0000-0000-0000-000000000000', { waitUntil: 'networkidle' });
    assert.equal(clubResponse?.status(), 200, 'URL permanente do clube entrega shell');
    assert.equal(await page.getByText('Clube não encontrado').count(), 1, 'clube inexistente sem títulos fictícios');
    await page.screenshot({ path: resolve(output, `clube-nao-encontrado-${size}.png`), fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, [], 'Erros de JavaScript no navegador');
  console.log(`Capturas salvas em ${output}; 7 páginas × 2 viewports e fluxos público/protegido validados.`);
} finally { await browser.close(); }

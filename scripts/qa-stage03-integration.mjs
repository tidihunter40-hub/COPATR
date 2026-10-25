import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = (process.env.TR_QA_URL || 'http://127.0.0.1:45321').replace(/\/$/, '');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const viewports = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const navigationOnly = process.argv.includes('--navigation');
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const errors = [];

async function makePage(width) {
  const context = await browser.newContext({
    viewport: { width, height: width <= 430 ? 844 : 900 },
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width}px: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${width}px: ${error.message}`));
  return { context, page };
}

async function openHome(page) {
  const response = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, 'homepage entrega HTTP 200');
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const image of document.images) image.loading = 'eager';
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  });
}

try {
  for (const width of navigationOnly ? [] : viewports) {
    const { context, page } = await makePage(width);
    await openHome(page);
    const audit = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      broken: [...document.images].filter((image) => image.getClientRects().length && (!image.complete || image.naturalWidth === 0)).map((image) => image.currentSrc || image.src),
      routeCards: document.querySelectorAll('.home-route-card').length,
      sportCards: document.querySelectorAll('.hero-sport-card').length,
      hasFooter: Boolean(document.querySelector('#contato')),
    }));
    assert.ok(audit.overflow <= 1, `${width}px: rolagem horizontal global de ${audit.overflow}px`);
    assert.deepEqual(audit.broken, [], `${width}px: imagem quebrada`);
    assert.equal(audit.sportCards, 6, `${width}px: modalidades incompletas`);
    assert.equal(audit.routeCards, 3, `${width}px: cards inferiores incompletos`);
    assert.ok(audit.hasFooter, `${width}px: contato ausente`);
    assert.match(await page.locator('.hero-live').innerText(), /SIMULAÇÃO VISUAL/i, `${width}px: placar sem identificação`);
    await context.close();
    console.log(`${width}px: homepage responsiva aprovada`);
  }

  const { context, page } = await makePage(1440);
  await openHome(page);
  const primaryNavigation = [
    ['Funcionalidades', /\/funcionalidades$/],
    ['Como funciona', /\/como-funciona$/],
    ['Campeonatos', /\/campeonatos$/],
    ['Planos', /\/planos$/],
    ['Demonstração', /\/demonstracao$/],
  ];
  for (const [name, target] of primaryNavigation) {
    await openHome(page);
    await page.getByRole('link', { name, exact: true }).first().click();
    await page.waitForURL(target);
    assert.ok(await page.locator('#route-banner:visible').count(), `${name}: rota sem conteúdo`);
  }
  await openHome(page);
  await page.getByRole('link', { name: 'Contato', exact: true }).click();
  await page.waitForURL(/\/#contato$/);
  assert.ok(await page.locator('#contato').evaluate((node) => node.getBoundingClientRect().top < innerHeight), 'Contato: destino não foi exibido');
  await openHome(page);
  await page.locator('.hero-demo-action').click();
  await page.waitForURL(/\/demonstracao$/);
  assert.ok(await page.locator('#lab-app:visible').count(), 'Demonstração: laboratório não foi montado');
  await openHome(page);
  await page.locator('.hero-sport-card[data-sport="Futebol"]').click();
  await page.locator('.sport-card.selected').waitFor();
  assert.match(await page.locator('.sport-card.selected').innerText(), /Futebol/i, 'Modalidade: seleção de Futebol não foi aplicada');
  await openHome(page);
  await page.locator('.header-cta').click();
  await page.waitForURL(/\/entrar\?retorno=%2Fpainel%2Fcampeonatos%2Fnovo$/);
  assert.ok(await page.locator('#login-form:visible').count(), 'Entrar: autenticação não foi exibida');
  await page.goto(`${base}/painel`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/entrar\?retorno=/);
  assert.ok(await page.locator('#login-form:visible').count(), 'Painel: visitante sem sessão não foi isolado');
  for (const route of ['/painel/campeonatos/novo', '/dashboard', '/organizador', '/admin']) {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    await page.waitForURL(/\/entrar\?retorno=/);
    assert.ok(await page.locator('#login-form:visible').count(), `${route}: visitante sem sessão não foi encaminhado para autenticação`);
  }
  await page.goto(`${base}/c/00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' });
  assert.equal(await page.getByText('Campeonato não encontrado').count(), 1, 'URL pública inexistente exibiu dados indevidos');
  await context.close();
  assert.deepEqual(errors, [], `Erros no console: ${errors.join(' | ')}`);
  console.log('Navegação pública, demonstração e isolamento do painel aprovados.');
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const phase = process.argv.includes('--baseline') ? 'baseline' : 'final';
const base = resolve('captures/etapa-06', phase);
const url = 'http://127.0.0.1:45321/';
const sections = [
  ['inicio', '#inicio'], ['painel-previa', '#previa-sistema'], ['plataforma', '#plataforma'],
  ['funcionalidades', '#funcionalidades'], ['modalidades', '#modalidades'], ['como-funciona', '#como-funciona'],
  ['historico', '#historia'], ['galeria', '#galeria'], ['laboratorio', '#demonstracao'],
  ['campeonatos-publicos', '#campeonatos'], ['planos', '#planos'], ['perguntas', '.faq-section'], ['rodape', '#contato'],
];
const showcase = ['dashboard', 'championships', 'matches', 'standings', 'statistics'];
const lab = ['config', 'matches', 'standings', 'portal'];
const organizer = ['dashboard', 'championships', 'teams', 'players', 'matches', 'classification', 'bracket', 'stats', 'champions', 'settings'];
const clubs = ['galatasarrafo', 'quack', 'vibe', 'facao', 'underdogs', 'maquina'];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const inventory = [];
const errors = [];

async function capture(page, group, name, viewport, locator, fullPage = false) {
  const target = resolve(base, group, `${name}-${viewport}.png`);
  await mkdir(resolve(base, group), { recursive: true });
  if (fullPage) await page.screenshot({ path: target, fullPage: true, animations: 'disabled' });
  else if (!locator) await page.screenshot({ path: target, animations: 'disabled' });
  else {
    // Isolated section captures omit the sticky navigation covering section content.
    if (group === 'home') await page.locator('.site-header').evaluate((element) => { element.style.visibility = 'hidden'; });
    await page.locator(locator).screenshot({ path: target, animations: 'disabled', timeout: 20000 });
    if (group === 'home') await page.locator('.site-header').evaluate((element) => { element.style.visibility = ''; });
  }
  inventory.push({ group, name, viewport, path: target });
}

try {
  for (const [viewport, width, height] of [['desktop', 1440, 900], ['mobile', 375, 812]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${viewport}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${viewport}: ${message.text()}`); });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200);
    await page.locator('#showcase-tab-dashboard').waitFor();
    await page.waitForFunction(() => globalThis.TRPublicHomeData !== undefined);
    await page.evaluate(async () => { for (const image of document.images) image.loading = 'eager'; await Promise.all([...document.images].map((image) => image.decode().catch(() => {}))); await document.fonts.ready; });
    await capture(page, 'home', 'pagina-completa', viewport, null, true);
    if (viewport === 'mobile') {
      await page.locator('#menu-toggle').click();
      await capture(page, 'estados', 'menu-aberto', viewport, null);
      await page.locator('#menu-toggle').click();
    }
    for (const [name, selector] of sections) await capture(page, 'home', name, viewport, selector);
    await page.locator('.faq-section summary').first().click();
    await capture(page, 'estados', 'pergunta-aberta', viewport, '.faq-section');
    for (const tab of showcase) {
      await page.locator(`#showcase-tab-${tab}`).click();
      await capture(page, 'plataforma-abas', tab, viewport, '#plataforma');
    }
    await page.locator('.lab-tab[data-tab="config"]').click();
    await page.locator('#load-example').click();
    await page.locator('#generate').click();
    await page.locator('.feedback').waitFor({ state: 'detached', timeout: 7000 });
    for (const tab of lab) {
      await page.locator(`.lab-tab[data-tab="${tab}"]`).click();
      await capture(page, 'laboratorio-abas', tab, viewport, '#lab-app');
    }
    await page.locator('.lab-tab[data-tab="matches"]').click();
    await page.locator('.match-form').first().locator('[name="homeScore"]').fill('2');
    await page.locator('.match-form').first().locator('[name="awayScore"]').fill('1');
    await page.locator('.match-form').first().locator('.match-save').click();
    await page.locator('.feedback').waitFor({ state: 'detached', timeout: 7000 });
    await capture(page, 'estados', 'placar-registrado', viewport, '#lab-app');
    await page.locator('.lab-tab[data-tab="standings"]').click();
    await capture(page, 'estados', 'classificacao-com-resultado', viewport, '#lab-app');
    await page.goto(`${url}#classificacao`, { waitUntil: 'domcontentloaded' });
    await page.locator('.tr-classification-content').waitFor();
    for (const tab of organizer) {
      await page.locator(`[data-tr-page="${tab}"]`).click();
      await capture(page, 'organizador-abas', tab, viewport, '.tr-classification');
    }
    for (const club of clubs) {
      await page.goto(`${url}#clube-esports-${club}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.club-profile-stage04').waitFor();
      await capture(page, 'clubes', club, viewport, '#club-profile-root');
    }
    const metrics = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, zoom: visualViewport.scale }));
    console.log(`${viewport}: ${inventory.filter((item) => item.viewport === viewport).length} capturas, ${JSON.stringify(metrics)}`);
    await context.close();
  }
  await writeFile(resolve(base, 'inventory.json'), JSON.stringify({ phase, sections, showcase, lab, organizer, clubs, captures: inventory, errors }, null, 2));
  assert.deepEqual(errors, [], `Console errors: ${errors.join(' | ')}`);
  console.log(`Captured ${inventory.length} views in ${base}`);
} finally { await browser.close(); }

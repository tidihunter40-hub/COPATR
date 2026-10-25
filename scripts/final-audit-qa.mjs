import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve('captures/auditoria-final-2026-10-24');
const base = `http://127.0.0.1:${process.env.PORT || 47777}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const report = { base, widths: [], navigation: {}, errors: [], captures: [] };
const shot = async (page, name, locator) => {
  const file = resolve(out, `${name}.png`);
  if (locator) await page.locator(locator).screenshot({ path: file, animations: 'disabled', timeout: 15000 });
  else await page.screenshot({ path: file, animations: 'disabled' });
  report.captures.push(name);
};
const open = async (page, path, selector) => {
  const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
  assert.equal(response?.status(), 200, `${path}: HTTP`);
  if (selector) await page.locator(selector).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(350);
};
const dimensions = async page => page.evaluate(() => ({
  viewport: innerWidth,
  document: document.documentElement.scrollWidth,
  brokenVisibleImages: [...document.images].filter(img => img.getBoundingClientRect().top < innerHeight && img.complete && !img.naturalWidth).map(img => img.getAttribute('src')),
}));

try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    const mobile = width <= 430;
    const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${width}px pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(`${width}px console: ${message.text()}`); });
    const entry = { width, pages: {} };

    await open(page, '/', '#inicio');
    entry.pages.home = await dimensions(page);
    if ([390, 1440].includes(width)) await shot(page, `inicio-${width}`);
    if (mobile) {
      await page.locator('#menu-toggle').click();
      assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true', `${width}px menu mobile`);
      assert.equal(await page.locator('#main-nav').isVisible(), true, `${width}px navegação mobile`);
      await page.locator('#menu-toggle').click();
      assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false', `${width}px fechamento do menu`);
      entry.pages.home.mobileMenu = true;
    }

    await open(page, '/entrar', '#account-status');
    entry.pages.login = { ...(await dimensions(page)), formVisible: await page.locator('#login-form').isVisible(), status: (await page.locator('#account-status').innerText()).slice(0, 160) };
    if ([390, 1440].includes(width)) await shot(page, `login-${width}`);
    await page.locator('[data-password-toggle]').click();
    assert.equal(await page.locator('#login-form input[name="password"]').getAttribute('type'), 'text', `${width}px mostrar senha`);
    await page.locator('#signup-toggle').click();
    assert.equal(await page.locator('#login-form input[name="display_name"]').count(), 1, `${width}px alternar cadastro`);
    await page.locator('#signup-toggle').click();
    entry.pages.login.controls = true;

    await open(page, '/campeonatos', '#campeonatos');
    if ([390, 1440].includes(width)) await page.waitForFunction(() => Boolean(window.TRPublicHomeData), null, { timeout: 12000 }).catch(() => {});
    entry.pages.competitions = { ...(await dimensions(page)), text: (await page.locator('#campeonatos').innerText()).slice(0, 160), dataState: (await page.locator('#public-competitions').innerText()).slice(0, 160), backendStatus: await page.evaluate(() => window.TRPublicHomeData?.competitionsStatus || 'pending') };
    if ([390, 1440].includes(width)) await shot(page, `campeonatos-${width}`);

    await open(page, '/demonstracao/copa-tr-esports', '.public-featured .match-arena');
    entry.pages.demoPortal = { ...(await dimensions(page)), matches: await page.locator('#jogos .match-arena').count(), teams: await page.locator('#equipes .public-team-card').count(), standings: await page.locator('.standing-mobile-row').count(), publicForms: await page.locator('main form').count() };
    assert.equal(await page.locator('#equipes .public-team-card[href^="/clubes/"]').count(), 0, 'A demonstração não deve apontar para perfis oficiais inexistentes');
    if ([390, 1440].includes(width)) {
      await shot(page, `portal-${width}`);
      await shot(page, `jogos-${width}`, '#jogos');
      await shot(page, `classificacao-${width}`, '#classificacao');
      await shot(page, `equipes-${width}`, '#equipes');
      await shot(page, `estatisticas-${width}`, '#estatisticas');
    }
    await page.locator('.fixture-filter[data-filter="results"]').click();
    const filteredResults = await page.locator('#jogos .match-arena:visible').count();
    assert.ok(filteredResults > 0 && filteredResults < entry.pages.demoPortal.matches, `${width}px filtro de resultados`);
    await page.locator('.fixture-filter[data-filter="upcoming"]').click();
    const filteredUpcoming = await page.locator('#jogos .match-arena:visible').count();
    assert.equal(filteredResults + filteredUpcoming, entry.pages.demoPortal.matches, `${width}px filtros de jogos`);
    await page.locator('.fixture-filter[data-filter="all"]').click();
    if (mobile) {
      await page.locator('.standing-mobile-details summary').first().click();
      assert.equal(await page.locator('.standing-mobile-details').first().getAttribute('open'), '', `${width}px expansão da classificação`);
      if (width === 390) await shot(page, 'classificacao-expandida-390', '#classificacao');
    } else {
      await page.locator('.standing-expand').first().click();
      assert.equal(await page.locator('.standing-expand').first().getAttribute('aria-expanded'), 'true', `${width}px expansão da classificação`);
      if (width === 1440) await shot(page, 'classificacao-expandida-1440', '#classificacao');
    }
    entry.pages.demoPortal.filters = { results: filteredResults, upcoming: filteredUpcoming, expanded: true };
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__auditedShareUrl = value; } } });
    });
    await page.locator('#share-competition').click();
    await page.waitForFunction(() => document.querySelector('#share-status')?.textContent?.trim());
    entry.pages.demoPortal.shareFeedback = (await page.locator('#share-status').innerText()).slice(0, 100);
    assert.equal(await page.evaluate(() => window.__auditedShareUrl), page.url(), `${width}px URL de compartilhamento`);
    const detailHref = await page.locator('.public-featured .fixture-detail-link').getAttribute('href');
    await open(page, detailHref, '.public-detail-page .match-arena');
    entry.pages.matchDetail = { ...(await dimensions(page)), backHref: await page.locator('.public-detail-page>.back-link').getAttribute('href') };
    if ([390, 1440].includes(width)) {
      await page.waitForFunction(() => [...document.querySelectorAll('.public-detail-page .match-arena img')].every(img => img.complete && img.naturalWidth > 0));
      await page.waitForTimeout(250);
      await shot(page, `detalhes-${width}`);
    }
    await page.locator('.public-detail-page>.back-link').click();
    entry.pages.matchBack = page.url().includes('#jogos');
    assert.equal(entry.pages.matchBack, true, `${width}px retorno aos jogos`);
    for (const [pageName, result] of Object.entries(entry.pages)) {
      if (result.document) assert.ok(result.document <= width + 1, `${width}px overflow em ${pageName}: ${result.document}`);
    }
    report.widths.push(entry);
    console.log(`${width}px: início, login, campeonatos, portal, jogos, detalhes, classificação, equipes e estatísticas verificados.`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(base + '/painel', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1000);
  report.navigation.panelAnonymous = { path: new URL(page.url()).pathname, hasAdminPanel: await page.locator('.panel-layout').count() > 0, text: (await page.locator('body').innerText()).slice(0, 180) };
  await shot(page, 'painel-acesso-anonimo-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'painel-acesso-anonimo-390');
  const alias = await page.goto(base + '/admin', { waitUntil: 'domcontentloaded', timeout: 20000 });
  report.navigation.adminAlias = { status: alias?.status(), path: new URL(page.url()).pathname };
  await context.close();
  await writeFile(resolve(out, 'resultado.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ navigation: report.navigation, errors: report.errors.length, captures: report.captures.length, out }));
} finally {
  await browser.close();
}

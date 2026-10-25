import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const url = process.env.TR_QA_URL || 'http://127.0.0.1:45321/';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const errors = [];
const sizes = [
  { name: 'desktop', width: 1440, height: 900, capture: true },
  { name: 'laptop-wide', width: 1366, height: 768, capture: true },
  { name: 'notebook', width: 1024, height: 800, capture: true },
  { name: 'tablet', width: 768, height: 1024, capture: true },
  { name: 'large-mobile', width: 430, height: 932, capture: false },
  { name: 'mobile', width: 390, height: 844, capture: true },
  { name: 'mobile-375', width: 375, height: 812, capture: true },
  { name: 'small-mobile', width: 320, height: 700, capture: true },
];

try {
  for (const size of sizes.filter((item) => !process.argv[2] || item.name === process.argv[2])) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${size.name}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${size.name}: ${message.text()}`); });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), 200, `${size.name}: homepage HTTP`);
    assert.equal(await page.locator('.hero:visible').count(), 1, `${size.name}: hero na homepage`);
    assert.equal(await page.locator('#previa-sistema:visible').count(), 0, `${size.name}: painel demonstrativo fora da homepage`);
    const demoResponse = await page.goto(`${url}demonstracao`, { waitUntil: 'domcontentloaded' });
    assert.equal(demoResponse?.status(), 200, `${size.name}: demonstração HTTP`);
    await page.locator('#showcase-tab-dashboard').waitFor();
    await page.waitForFunction(() => globalThis.TRPublicHomeData !== undefined);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = 'eager';
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    const report = await page.evaluate(() => {
      const brand = document.querySelector('.brand-image');
      const rect = brand.getBoundingClientRect();
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        logoRatio: rect.width / rect.height,
        logoNaturalRatio: brand.naturalWidth / brand.naturalHeight,
        brokenImages: [...document.images].filter((image) => image.getClientRects().length && (!image.complete || image.naturalWidth === 0)).map((image) => image.getAttribute('src')),
        overflowing: [...document.querySelectorAll('body *')].map((element) => ({ tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', right: Math.round(element.getBoundingClientRect().right) })).filter((element) => element.right > innerWidth + 1).slice(0, 12),
        wideContainers: [...document.querySelectorAll('body, body *')].filter((element) => element.scrollWidth > element.clientWidth + 2).map((element) => ({ tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', width: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: getComputedStyle(element).overflowX })).slice(0, 20),
      };
    });
    if (report.scrollWidth > report.width + 1) console.log(`${size.name} elementos excedentes:`, report.overflowing, report.wideContainers);
    assert.ok(report.scrollWidth <= report.width + 1, `${size.name}: rolagem horizontal ${report.scrollWidth} > ${report.width}`);
    assert.ok(Math.abs(report.logoRatio - report.logoNaturalRatio) < .02, `${size.name}: logomarca distorcida`);
    assert.deepEqual(report.brokenImages, [], `${size.name}: imagens não carregadas`);
    assert.equal(await page.locator('#home-dashboard-metrics .home-metric').count(), 6, `${size.name}: seis indicadores da central esportiva`);
    const panelLayout = await page.evaluate(() => {
      const main = document.querySelector('.home-device-content');
      const cards = [...document.querySelectorAll('.home-dashboard-detail > div > .home-dashboard-card')];
      const matches = document.querySelector('.home-matches-card').getBoundingClientRect();
      const standings = document.querySelector('.home-standings-card').getBoundingClientRect();
      return { mainBackground: getComputedStyle(main).backgroundColor, cardBackground: getComputedStyle(cards[0]).backgroundColor, matches: { top: matches.top, right: matches.right }, standings: { top: standings.top, left: standings.left } };
    });
    assert.equal(panelLayout.mainBackground, 'rgb(245, 247, 251)', `${size.name}: área principal branco premium`);
    assert.equal(panelLayout.cardBackground, 'rgb(255, 255, 255)', `${size.name}: cartões brancos`);
    if (size.width >= 1300) assert.ok(panelLayout.matches.right < panelLayout.standings.left && Math.abs(panelLayout.matches.top - panelLayout.standings.top) < 2, `${size.name}: partidas e classificação lado a lado`);
    if (size.width <= 768) assert.ok(panelLayout.standings.top > panelLayout.matches.top, `${size.name}: cartões empilhados no celular/tablet`);
    const readability = await page.evaluate(() => {
      const fixture = document.querySelector('.home-fixture');
      const name = fixture.querySelector('.home-fixture-side');
      const crest = fixture.querySelector('.home-crest');
      const tableTeam = document.querySelector('.home-table-team');
      return { nameSize: parseFloat(getComputedStyle(name).fontSize), crestWidth: crest.getBoundingClientRect().width, tableTeamSize: parseFloat(getComputedStyle(tableTeam).fontSize), zoom: visualViewport.scale };
    });
    assert.equal(readability.zoom, 1, `${size.name}: captura em zoom padrão`);
    if (size.width >= 1300) assert.ok(readability.nameSize >= 15 && readability.crestWidth >= 64 && readability.tableTeamSize >= 12, `${size.name}: nomes e escudos legíveis no desktop`);
    if (size.width <= 430) assert.ok(readability.nameSize >= 11 && readability.crestWidth >= 30, `${size.name}: nomes e escudos proporcionais no celular`);
    assert.equal(await page.locator('#home-next-matches .home-crest-esports').count(), 6, `${size.name}: seis escudos fornecidos na Copa TR E-SPORTS`);
    if (size.name === 'desktop') {
      const decoded = await page.evaluate(async () => Promise.all(['quack.jpeg', 'galatasarrafo.jpe', 'vibe.jpeg', 'facao.jpeg', 'underdogs.webp', 'maquina.png'].map(async (name) => {
        const crest = new Image();
        crest.src = `/assets/demo-esports/${name}`;
        try { await crest.decode(); return crest.naturalWidth > 0 && crest.naturalHeight > 0; } catch { return false; }
      })));
      assert.ok(decoded.every(Boolean), 'seis escudos fornecidos carregam sem erro');
    }
    const previewTable = await page.locator('.home-table-scroll').evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    if (size.width >= 1100) assert.ok(previewTable.scrollWidth <= previewTable.width + 1, `${size.name}: classificação da prévia sem rolagem desnecessária (${previewTable.scrollWidth}/${previewTable.width})`);
    if (size.width <= 430) assert.ok(previewTable.scrollWidth > previewTable.width, `${size.name}: classificação da prévia rola dentro do painel`);
    if (size.capture) {
      await page.screenshot({ path: resolve(`preview-stage03-${size.name}.png`), fullPage: true, animations: 'disabled' });
      await page.screenshot({ path: resolve(`preview-stage03-${size.name}-fold.png`), animations: 'disabled' });
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = 'hidden'; });
      await page.locator('#plataforma').screenshot({ path: resolve(`preview-stage03-${size.name}-platform.png`), animations: 'disabled' });
      await page.locator('#previa-sistema').screenshot({ path: resolve(`preview-stage032-${size.name}-dashboard.png`), animations: 'disabled' });
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = ''; });
      if (size.name === 'desktop' || size.name === 'mobile-375') {
        await page.evaluate(() => {
          document.querySelector('.site-header').style.visibility = '';
          const frame = document.querySelector('.home-device-frame');
          window.scrollTo({ top: frame.getBoundingClientRect().top + scrollY - (innerWidth >= 700 ? 88 : 72), behavior: 'instant' });
        });
        await page.screenshot({ path: resolve(`preview-stage032-${size.name}-100pct.png`), animations: 'disabled' });
      }
    }
    await page.locator('[data-preview-mode="local"]').click();
    await page.locator('.showcase-source-switch button').nth(1).click();
    if (size.name === 'desktop') {
      await page.evaluate(async () => {
        const image = await fetch('/assets/official/03_icone_app_transparente.png').then((response) => response.blob());
        const crest = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(new Blob([image], { type: 'image/png' })); });
        localStorage.setItem('tr-campeonatos-demo-v1', JSON.stringify({
          name: 'Verificação de escudo', sport: 'Futebol', format: 'single',
          teams: [{ id: 'real-crest', name: 'Clube com escudo', crest }, { id: 'no-crest', name: 'Clube sem escudo' }],
          fixtures: [{ id: 'test-fixture', round: 1, homeId: 'real-crest', awayId: 'no-crest', homeScore: null, awayScore: null, history: [] }],
        }));
        window.dispatchEvent(new Event('tr:demo-updated'));
      });
      await page.locator('#home-next-matches img.home-crest[src^="data:image/png"]').waitFor();
      assert.equal(await page.locator('#home-next-matches .home-crest-demo').count(), 1, 'escudo real tem prioridade sobre arte demonstrativa');
      await page.locator('#showcase-panel img.demo-crest[src^="data:image/png"]').first().waitFor();
      await page.evaluate(() => { localStorage.removeItem('tr-campeonatos-demo-v1'); window.dispatchEvent(new Event('tr:demo-updated')); });
      await page.locator('#home-next-matches .home-crest-demo').first().waitFor();
    }
    await page.locator('#showcase-tab-matches').click();
    assert.match(await page.locator('#showcase-panel').innerText(), /Partidas/);
    await page.locator('#showcase-tab-dashboard').click();
    if (size.name === 'desktop' || size.name === 'mobile') {
      if (size.name === 'mobile') await page.locator('#menu-toggle').click();
      await page.locator('#main-nav a[href="/funcionalidades"]').click();
      assert.equal(new URL(page.url()).pathname, '/funcionalidades', `${size.name}: navegação por URL`);
      await page.goto(`${url}demonstracao`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-preview-mode="local"]').click();
      await page.locator('.showcase-source-switch button').nth(1).click();
    }
    await page.locator('#load-example').click();
    assert.match(await page.locator('.persistence-notice').innerText(), /Modo demonstração local/);
    assert.match(await page.locator('.persistence-notice').innerText(), /Supabase (ainda não configurado|configurado)/);
    assert.equal(await page.locator('.teams-list li').count(), 4, `${size.name}: exemplo carrega quatro equipes`);
    const configLayout = await page.evaluate(() => {
      const panel = document.querySelector('.lab-content').getBoundingClientRect();
      return [...document.querySelectorAll('.config-grid .form-card')].map((card) => ({ left: card.getBoundingClientRect().left, right: card.getBoundingClientRect().right, panelLeft: panel.left, panelRight: panel.right }));
    });
    assert.ok(configLayout.every((card) => card.left >= card.panelLeft - 1 && card.right <= card.panelRight + 1), `${size.name}: cartões da configuração visíveis sem corte`);
    if (size.capture) {
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = 'hidden'; document.querySelector('.feedback')?.remove(); });
      await page.locator('#lab-app').screenshot({ path: resolve(`preview-stage04-${size.name}-config.png`), animations: 'disabled' });
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = ''; });
    }
    await page.locator('#generate').click();
    assert.ok(await page.locator('.match-card').count() > 0, `${size.name}: confrontos gerados`);
    await page.locator('.match-card').first().locator('[name="homeScore"]').fill('2');
    await page.locator('.match-card').first().locator('[name="awayScore"]').fill('1');
    await page.locator('.match-card').first().locator('.match-save').click();
    assert.match(await page.locator('.match-card').first().innerText(), /Resultado registrado/);
    assert.equal(await page.locator('#home-dashboard-metrics .home-metric').nth(3).locator('strong').innerText(), '01', `${size.name}: prévia reflete partidas com resultado`);
    assert.equal(await page.locator('#home-standings tr').first().locator('td.pts').innerText(), '3', `${size.name}: prévia reflete a classificação do laboratório`);
    assert.match(await page.locator('#home-insights').innerText(), /LÍDER DA TABELA/);
    await page.locator('.home-zone-controls summary').click();
    await page.locator('#home-zone-qualified').fill('2');
    await page.locator('#home-zone-qualified').press('Tab');
    await page.locator('#home-zone-eliminated').fill('1');
    await page.locator('#home-zone-eliminated').press('Tab');
    assert.equal(await page.locator('#home-standings tr.qualified').count(), 2, `${size.name}: faixa visual de classificação configurável`);
    assert.equal(await page.locator('#home-standings tr.eliminated').count(), 1, `${size.name}: faixa visual de eliminação configurável`);
    await page.locator('.match-card').first().locator('[name="homeScore"]').fill('3');
    await page.locator('.match-card').first().locator('.match-save').click();
    await page.locator('.match-card').first().locator('.history-toggle').click();
    assert.match(await page.locator('.match-card').first().locator('.history-list').innerText(), /2 × 1/);
    await page.locator('.match-card').first().locator('.history-toggle').click();
    if (size.capture) {
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = 'hidden'; document.querySelector('.feedback')?.remove(); });
      await page.locator('#lab-app').screenshot({ path: resolve(`preview-stage04-${size.name}-matches.png`), animations: 'disabled' });
    }
    await page.locator('.lab-tab[data-tab="standings"]').click();
    assert.equal(await page.locator('.standings-table th').count(), 11, `${size.name}: todas as colunas da classificação`);
    assert.equal(await page.locator('.standings-table tbody tr').count(), 4, `${size.name}: todas as equipes classificadas`);
    assert.equal(await page.locator('.standings-table tbody tr').first().locator('td').nth(2).innerText(), '3', `${size.name}: vitória soma três pontos`);
    const labReport = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, tableWidth: document.querySelector('.table-wrap').clientWidth, tableScrollWidth: document.querySelector('.table-wrap').scrollWidth }));
    assert.ok(labReport.pageWidth <= labReport.viewportWidth + 1, `${size.name}: laboratório cria rolagem horizontal na página`);
    if (size.width <= 760) assert.ok(labReport.tableScrollWidth > labReport.tableWidth, `${size.name}: tabela deve rolar dentro do painel`);
    if (size.capture) {
      await page.locator('#lab-app').screenshot({ path: resolve(`preview-stage04-${size.name}-standings.png`), animations: 'disabled' });
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = ''; });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-preview-mode="local"]').click();
    assert.equal(await page.locator('#home-zone-qualified').inputValue(), '2', `${size.name}: faixas visuais persistidas`);
    await page.locator('.lab-tab[data-tab="standings"]').click();
    assert.equal(await page.locator('.standings-table tbody tr').count(), 4, `${size.name}: dados persistidos após recarregar`);
    assert.equal(await page.locator('.standings-table tbody tr').first().locator('td').nth(2).innerText(), '3', `${size.name}: pontos persistidos após recarregar`);
    await page.locator('.lab-tab[data-tab="portal"]').click();
    assert.match(await page.locator('.portal-head').innerText(), /Copa TR de Verão/i);
    if (size.capture) {
      await page.evaluate(() => { document.querySelector('.site-header').style.visibility = 'hidden'; });
      await page.locator('#lab-app').screenshot({ path: resolve(`preview-stage04-${size.name}-portal.png`), animations: 'disabled' });
    }
    if (size.name === 'desktop') {
      await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('tr-campeonatos-demo-v1'));
        const live = state.fixtures.find((match) => match.homeScore === null);
        live.status = 'in_progress';
        live.homeScore = 0;
        live.awayScore = 0;
        localStorage.setItem('tr-campeonatos-demo-v1', JSON.stringify(state));
        window.dispatchEvent(new Event('tr:demo-updated'));
      });
      assert.equal(await page.locator('#home-next-matches .home-fixture.is-live').count(), 1, 'estado em andamento destacado quando presente nos dados');
      assert.equal(await page.locator('#home-dashboard-metrics .home-metric').nth(3).locator('strong').innerText(), '01', 'placar em andamento não conta como partida finalizada');
    }
    await context.close();
    console.log(`${size.name}: ${report.width}px, página ${report.pageHeight}px, fluxo completo, persistência e rolagem ok`);
  }
  assert.deepEqual(errors, [], `Erros no console: ${errors.join(' | ')}`);
  console.log('Console sem erros; abas interativas em todas as larguras.');
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const dist = resolve('dist');
const out = resolve('captures/proximos-jogos-2026-10-25');
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'tr.local') return route.abort();
      const file = url.pathname === '/demonstracao/copa-tr-esports' ? 'demo-competition.html' : url.pathname.slice(1);
      const path = resolve(dist, file);
      if (!path.startsWith(dist + sep)) return route.abort();
      try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
      catch { return route.fulfill({ status: 404, body: 'Not found' }); }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://tr.local/demonstracao/copa-tr-esports', { waitUntil: 'networkidle' });
    await page.locator('.public-upcoming .match-arena').waitFor();
    await page.evaluate(async () => {
      for (const image of document.querySelectorAll('.public-overview img')) image.loading = 'eager';
      await Promise.all([...document.querySelectorAll('.public-overview img')].map((image) => image.decode().catch(() => {})));
    });
    const layout = await page.evaluate(() => {
      const rect = (element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      const card = document.querySelector('.public-upcoming .match-arena');
      const main = card.querySelector('.fixture-main');
      const teams = [...card.querySelectorAll('.fixture-team')];
      const names = teams.map((team) => team.querySelector('.fixture-team-name a, .fixture-team-name strong'));
      const score = card.querySelector('.fixture-score');
      const date = card.querySelector('.fixture-bottom');
      const button = card.querySelector('.fixture-detail-link');
      const crests = teams.map((team) => team.querySelector('.fixture-crest-frame img'));
      return {
        pageWidth: document.documentElement.scrollWidth,
        card: rect(card), main: rect(main), teams: teams.map(rect), names: names.map(rect), score: rect(score), date: rect(date), button: rect(button),
        nameTexts: names.map((name) => name.textContent.trim()),
        clippedNames: names.filter((name) => name.scrollHeight > name.clientHeight + 1 || name.scrollWidth > name.clientWidth + 1).length,
        crests: crests.map((crest) => ({ naturalWidth: crest.naturalWidth, fit: getComputedStyle(crest).objectFit, box: rect(crest), frame: rect(crest.closest('.fixture-crest-frame')) })),
        featuredCrestWidth: document.querySelector('.public-featured .fixture-crest-frame').getBoundingClientRect().width,
        buttonHref: button.getAttribute('href'),
      };
    });
    assert.deepEqual(errors, [], `${width}px: erros de execução`);
    assert.ok(layout.pageWidth <= width + 1, `${width}px: rolagem horizontal`);
    assert.equal(layout.clippedNames, 0, `${width}px: nome cortado`);
    assert.ok(layout.nameTexts.every(Boolean), `${width}px: nomes completos`);
    assert.ok(layout.crests.every((crest) => crest.naturalWidth > 0 && crest.fit === 'contain'), `${width}px: escudo íntegro`);
    assert.ok(layout.crests.every((crest, index) => crest.box.bottom <= layout.names[index].top - 2), `${width}px: escudo sobreposto ao nome`);
    assert.ok(layout.crests.every((crest) => crest.box.left >= layout.card.left && crest.box.right <= layout.card.right), `${width}px: escudo fora do cartão`);
    assert.ok(layout.teams[0].right + 2 <= layout.score.left && layout.score.right + 2 <= layout.teams[1].left, `${width}px: adversários e VS sobrepostos`);
    assert.ok(layout.names.every((name) => name.left >= layout.card.left && name.right <= layout.card.right), `${width}px: nome fora do cartão`);
    assert.ok(layout.date.top >= layout.main.bottom - 1 && layout.button.top >= layout.date.bottom - 1, `${width}px: data ou botão sobrepostos`);
    assert.ok(layout.button.left >= layout.card.left && layout.button.right <= layout.card.right && layout.button.bottom <= layout.card.bottom, `${width}px: botão cortado`);
    assert.ok(layout.featuredCrestWidth > layout.crests[0].box.width, `${width}px: destaque precisa ser maior que a agenda`);
    assert.match(layout.buttonHref, /^\/c\/|^\/demonstracao\//, `${width}px: navegação de detalhes`);
    await page.locator('.public-overview').screenshot({ path: resolve(out, `confrontos-${width}.png`), animations: 'disabled' });
    const longNames = await page.evaluate(() => {
      const card = document.querySelector('.public-upcoming .match-arena');
      const names = [...card.querySelectorAll('.fixture-team-name a, .fixture-team-name strong')];
      names[0].textContent = 'Esporte Clube Independente da Serra';
      names[1].textContent = 'Atlético União Metropolitana';
      const box = (element) => element.getBoundingClientRect();
      const date = box(card.querySelector('.fixture-bottom'));
      const button = box(card.querySelector('.fixture-detail-link'));
      const score = box(card.querySelector('.fixture-score'));
      return { visible: names.every((name) => name.scrollWidth <= name.clientWidth + 1 && name.scrollHeight <= name.clientHeight + 1), namesClearVs: box(names[0]).right <= score.left - 2 && box(names[1]).left >= score.right + 2, namesAboveDate: names.every((name) => box(name).bottom <= date.top), buttonBelowDate: button.top >= date.bottom - 1, buttonInside: button.bottom <= box(card).bottom };
    });
    assert.ok(Object.values(longNames).every(Boolean), `${width}px: nomes longos: ${JSON.stringify(longNames)}`);
    console.log(`${width}px: escudos, nomes, VS, data, botão e largura OK`);
    await context.close();
  }
} finally { await browser.close(); }

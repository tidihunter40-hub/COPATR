import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const dist = resolve('dist');
const output = resolve('captures/visual-rebuild-2026-10-24');
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpe': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });

try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'tr.local') return route.abort();
      if (url.pathname === '/runtime-config.mjs') return route.fulfill({ contentType: 'text/javascript', body: 'export const supabaseConfig = Object.freeze({url:"",anonKey:""});' });
      const file = url.pathname === '/demonstracao' ? 'interactive-demo.html' : url.pathname === '/demonstracao/copa-tr-esports' ? 'demo-competition.html' : url.pathname === '/painel' ? 'panel.html' : url.pathname.slice(1);
      const path = resolve(dist, file);
      if (!path.startsWith(dist + sep)) return route.abort();
      try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
      catch { return route.fulfill({ status: 404, body: 'Not found' }); }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto('http://tr.local/demonstracao', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => { for (const image of document.images) image.loading = 'eager'; await Promise.all([...document.images].map((image) => image.decode().catch(() => {}))); });
    assert.equal(await page.locator('.match-card').count(), 3);
    assert.equal(await page.locator('.result-row').count(), 3);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      broken: [...document.images].filter((image) => !image.naturalWidth).map((image) => image.src),
      names: [...document.querySelectorAll('.match-team strong,.result-name')].map((node) => ({ text: node.textContent, cutX: node.scrollWidth - node.clientWidth, cutY: node.scrollHeight - node.clientHeight, size: getComputedStyle(node).fontSize })),
      crests: [...document.querySelectorAll('.match-team img,.result-team img')].map((image) => ({ fit: getComputedStyle(image).objectFit, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })),
      stacked: [...document.querySelectorAll('.match-team')].map((team) => { const [crest, side, name] = [...team.children].map((node) => node.getBoundingClientRect()); return { crestToSide: side.top - crest.bottom, sideToName: name.top - side.bottom }; }),
      crestBounds: [...document.querySelectorAll('.crest-frame img,.result-crest img')].map((image) => { const imageBox = image.getBoundingClientRect(); const frame = image.parentElement.getBoundingClientRect(); return { top: imageBox.top - frame.top, bottom: frame.bottom - imageBox.bottom, left: imageBox.left - frame.left, right: frame.right - imageBox.right }; }),
    }));
    assert.ok(layout.overflow <= 1, `${width}px: horizontal overflow ${layout.overflow}`);
    assert.deepEqual(layout.broken, [], `${width}px: broken images`);
    for (const name of layout.names) assert.ok(name.cutX <= 1 && name.cutY <= 2, `${width}px: clipped name ${JSON.stringify(name)}`);
    for (const crest of layout.crests) assert.equal(crest.fit, 'contain');
    for (const team of layout.stacked) assert.ok(team.crestToSide >= 0 && team.sideToName >= 0, `${width}px: overlapping team elements ${JSON.stringify(team)}`);
    for (const crest of layout.crestBounds) assert.ok(Object.values(crest).every((gap) => gap >= -1), `${width}px: crest exceeds its space ${JSON.stringify(crest)}`);
    assert.deepEqual(errors, [], `${width}px: page errors`);
    await page.locator('.matches-panel').screenshot({ path: resolve(output, `partidas-${width}.png`) });
    if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(output, `pagina-${width}.png`), fullPage: true });
    if (width === 390) {
      await page.locator('.simulate-button').first().click();
      await page.locator('#home-score').fill('2');
      await page.locator('#away-score').fill('1');
      await page.getByRole('button', { name: 'Confirmar resultado' }).click();
      assert.equal(await page.locator('.match-complete').count(), 1);
      assert.equal(await page.locator('.result-row').count(), 4);
      await page.locator('.matches-panel').screenshot({ path: resolve(output, 'partidas-390-simulado.png') });
      await page.locator('.undo-result-button').click();
      assert.equal(await page.locator('.result-row').count(), 3);
    }
    console.log(`${width}px: escudos, nomes, placares e interação OK`);
    await context.close();
  }
} finally { await browser.close(); }

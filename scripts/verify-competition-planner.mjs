import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const dist = resolve('dist');
const captures = resolve('captures/planner-redesign-2026-10-25');
await mkdir(captures, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpe': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'tr.local') return route.abort();
      const file = url.pathname === '/planejador' ? 'competition-planner.html' : url.pathname.slice(1);
      const path = resolve(dist, file);
      if (!path.startsWith(dist + sep)) return route.abort();
      try { return route.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: await readFile(path) }); }
      catch { return route.fulfill({ status: 404, body: 'Not found' }); }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://tr.local/planejador', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#planner-form > label:visible').count(), 3);
    assert.equal(await page.locator('#advanced-settings').getAttribute('open'), null);
    assert.equal(await page.locator('[name="stations"]:visible').count(), 0);
    assert.equal(await page.locator('.group-card').count(), 0);
    assert.equal(await page.locator('.field-surface').count(), 1);
    assert.equal(await page.locator('.initial-mark').count(), 0);
    const opening = await page.evaluate(() => {
      const form = document.querySelector('.planner-panel').getBoundingClientRect();
      const field = document.querySelector('.planner-output').getBoundingClientRect();
      return { formRight: form.right, formBottom: form.bottom, fieldLeft: field.left, fieldTop: field.top };
    });
    assert.ok(width > 900 ? opening.fieldLeft >= opening.formRight - 1 : opening.fieldTop >= opening.formBottom - 1);
    await page.screenshot({ path: resolve(captures, `inicio-${width}.png`), fullPage: true });
    await page.locator('#planner-count').fill('8');
    await page.getByRole('button', { name: /MONTAR CAMPEONATO/ }).click();
    assert.equal(await page.locator('.planner-layout.has-plan').count(), 1);
    assert.equal(await page.locator('.group-card').count(), 2);
    assert.equal(await page.locator('.team-tile').count(), 8);
    const before = await page.locator('.team-tile strong').allTextContents();
    await page.getByRole('button', { name: /SORTEAR EQUIPES/ }).click();
    assert.notDeepEqual(await page.locator('.team-tile strong').allTextContents(), before);
    assert.equal(await page.locator('.group-card').count(), 2);
    await page.getByRole('button', { name: /REFAZER SORTEIO/ }).click();
    assert.equal(await page.locator('.fixture-card').count(), 0);
    assert.equal(await page.getByRole('button', { name: /CONFIRMAR GRUPOS/ }).count(), 1);
    await page.getByRole('button', { name: /CONFIRMAR GRUPOS/ }).click();
    await page.getByRole('button', { name: /GERAR CONFRONTOS/ }).click();
    assert.equal(await page.locator('.fixture-card').count(), 12);
    await page.screenshot({ path: resolve(captures, `grupos-${width}.png`), fullPage: true });
    await page.locator('#planner-count').fill('12');
    await page.getByRole('button', { name: /MONTAR CAMPEONATO/ }).click();
    assert.equal(await page.locator('.group-card').count(), 4);
    assert.equal(await page.locator('.team-tile').count(), 12);
    await page.locator('#planner-count').fill('20');
    await page.getByRole('button', { name: /MONTAR CAMPEONATO/ }).click();
    assert.equal(await page.locator('.group-card').count(), 4);
    assert.equal(await page.locator('.team-tile').count(), 20);
    await page.locator('#planner-sport').selectOption('E-sports');
    await page.locator('#planner-format').selectOption('corujao');
    await page.getByRole('button', { name: /MONTAR CAMPEONATO/ }).click();
    assert.equal(await page.locator('.group-card').count(), 5);
    assert.equal(await page.locator('.team-tile').count(), 20);
    await page.getByRole('button', { name: /CONFIRMAR GRUPOS/ }).click();
    await page.getByRole('button', { name: /GERAR CONFRONTOS/ }).click();
    assert.equal(await page.locator('.fixture-card').count(), 30);
    await page.screenshot({ path: resolve(captures, `corujao-${width}.png`), fullPage: true });
    const visual = await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('.team-crest img')].map((image) => image.decode().catch(() => {})));
      return {
        brokenCrests: [...document.querySelectorAll('.team-crest img')].filter((image) => !image.naturalWidth).length,
        clippedNames: [...document.querySelectorAll('.team-tile strong, .fixture-side strong')].filter((name) => name.scrollWidth > name.clientWidth + 1).length,
      };
    });
    assert.equal(visual.brokenCrests, 0, `${width}px: escudos carregados`);
    assert.equal(visual.clippedNames, 0, `${width}px: nomes completos`);
    await page.locator('#planner-count').fill('21');
    await page.getByRole('button', { name: /MONTAR CAMPEONATO/ }).click();
    assert.match(await page.locator('#form-error').innerText(), /número par|não há formato|não permite/i);
    await page.locator('#planner-count').fill('20');
    await page.locator('#advanced-settings summary').click();
    await page.locator('input[name="stations"]').fill('5');
    await page.getByRole('button', { name: /MONTAR CAMPEONATO/ }).click();
    assert.match(await page.locator('#form-error').innerText(), /pelo menos 10 estações/);
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: horizontal overflow`);
    console.log(`${width}px: formulário, sorteio, confirmação, confrontos e layout OK`);
    await context.close();
  }
} finally { await browser.close(); }

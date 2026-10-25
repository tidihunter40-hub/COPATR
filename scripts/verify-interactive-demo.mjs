import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { ESPORTS_DEMO } from '../dist/esports-demo.mjs';
import { calculateStandings, updateResult } from '../dist/engine.mjs';

const base = process.env.TR_QA_URL || 'http://127.0.0.1:47888';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const captures = resolve('artifacts');
await mkdir(captures, { recursive: true });
const widths = [320, 375, 390, 430, 768, 1024, 1440];

async function assertStandings(page, fixtures) {
  const expected = calculateStandings(ESPORTS_DEMO.teams, fixtures);
  for (const [index, row] of expected.entries()) {
    const actual = page.locator('.standing-item').nth(index);
    assert.equal(await actual.locator('.standings-row').getAttribute('data-team-id'), row.id);
    assert.equal(Number(await actual.locator('.stat-points').textContent()), row.points);
    assert.equal(Number((await actual.locator('.standings-row > span').nth(1).textContent()).trim()), row.played);
    assert.equal((await actual.locator('.stat-goal-diff').textContent()).trim(), row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference));
    assert.deepEqual((await actual.locator('.secondary-stat').allTextContents()).map(Number), [row.wins, row.draws, row.losses]);
    assert.deepEqual((await actual.locator('.standing-detail strong').allTextContents()).map((value) => value.trim()), [row.wins, row.draws, row.losses, row.goalsFor, row.goalsAgainst, `${row.performance}%`].map(String));
  }
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width <= 430 ? 844 : 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    const externalDataRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/supabase|\/rest\/v1\/|\/auth\/v1\//i.test(request.url())) externalDataRequests.push(request.url()); });
    const response = await page.goto(`${base}/demonstracao`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('#demo-title').count(), 1);
    assert.equal(await page.locator('.strip-team img').count(), 6);
    assert.equal(await page.locator('.standing-item').count(), 6);
    assert.equal(await page.locator('.simulate-button').count(), 3);
    assert.deepEqual(externalDataRequests, [], `${width}px: external data requests`);
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, body: document.documentElement.scrollWidth, broken: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src) }));
    assert.ok(dimensions.body <= dimensions.viewport + 1, `${width}px: horizontal overflow ${JSON.stringify(dimensions)}`);
    assert.deepEqual(dimensions.broken, [], `${width}px: broken images`);
    assert.deepEqual(errors, [], `${width}px: browser errors`);
    const names = await page.evaluate(() => [...document.querySelectorAll('.match-team strong, .result-name, .standing-name')].map((node) => ({ text: node.textContent, width: node.clientWidth, scrollWidth: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight, whiteSpace: getComputedStyle(node).whiteSpace, textOverflow: getComputedStyle(node).textOverflow })));
    for (const name of names) {
      assert.equal(name.whiteSpace, 'normal', `${width}px: nome sem quebra: ${name.text}`);
      assert.notEqual(name.textOverflow, 'ellipsis', `${width}px: nome com reticências: ${name.text}`);
      assert.ok(name.scrollWidth <= name.width + 1 && name.scrollHeight <= name.height + 2, `${width}px: nome cortado: ${JSON.stringify(name)}`);
    }
    const crestAndName = await page.evaluate(() => [...document.querySelectorAll('.match-team')].map((team) => ({ crestBottom: team.querySelector('.crest-frame').getBoundingClientRect().bottom, nameTop: team.querySelector('strong').getBoundingClientRect().top })));
    if (width <= 600) for (const pair of crestAndName) assert.ok(pair.nameTop >= pair.crestBottom + 7, `${width}px: escudo sobrepõe nome`);
    if ([320, 390, 1440].includes(width)) await page.screenshot({ path: resolve(captures, `interactive-demo-${width}.png`), fullPage: true });
    if (width === 320) {
      await page.locator('.simulate-button').first().click();
      const dialogLayout = await page.evaluate(() => {
        const dialog = document.querySelector('#score-dialog').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.dialog-actions button')].map((button) => button.getBoundingClientRect());
        return { dialogLeft: dialog.left, dialogRight: dialog.right, buttonLeft: Math.min(...buttons.map((rect) => rect.left)), buttonRight: Math.max(...buttons.map((rect) => rect.right)) };
      });
      assert.ok(dialogLayout.dialogLeft >= 0 && dialogLayout.dialogRight <= width && dialogLayout.buttonLeft >= dialogLayout.dialogLeft && dialogLayout.buttonRight <= dialogLayout.dialogRight, `320px: editor transborda: ${JSON.stringify(dialogLayout)}`);
      await page.screenshot({ path: resolve(captures, 'interactive-demo-dialog-320.png') });
      await page.locator('#cancel-dialog').click();
    }
    if (width === 390) {
      const before = await page.locator('.standing-item').allInnerTexts();
      const matchNames = await page.locator('.match-card').first().locator('.match-team strong').allTextContents();
      const matchId = await page.locator('.match-card').first().getAttribute('data-fixture-id');
      await page.locator('.simulate-button').first().click();
      assert.deepEqual(await page.locator('.dialog-teams strong').allTextContents(), matchNames);
      await page.screenshot({ path: resolve(captures, 'interactive-demo-dialog-390.png') });
      await page.locator('#home-score').fill('2');
      await page.locator('#away-score').fill('1');
      await page.getByRole('button', { name: 'Confirmar resultado' }).click();
      assert.equal(await page.locator('.simulate-button').count(), 2);
      assert.equal(await page.locator('.edit-result-button').count(), 1);
      assert.match(await page.locator('#demo-explain').innerText(), /É assim que você administra seus campeonatos/);
      const after = await page.locator('.standing-item').allInnerTexts();
      assert.notDeepEqual(after, before);
      await assertStandings(page, updateResult(ESPORTS_DEMO.fixtures, matchId, 2, 1));
      await page.screenshot({ path: resolve(captures, 'interactive-demo-390-result.png'), fullPage: true });
      await page.locator('.edit-result-button').first().click();
      assert.equal(await page.locator('#dialog-heading').innerText(), 'Alterar resultado');
      assert.equal(await page.locator('#home-score').inputValue(), '2');
      await page.locator('#home-score').fill('1');
      await page.locator('#away-score').fill('1');
      await page.getByRole('button', { name: 'Confirmar resultado' }).click();
      await assertStandings(page, updateResult(ESPORTS_DEMO.fixtures, matchId, 1, 1));
      await page.locator('.edit-result-button').first().click();
      await page.locator('#home-score').fill('0');
      await page.locator('#away-score').fill('2');
      await page.getByRole('button', { name: 'Confirmar resultado' }).click();
      await assertStandings(page, updateResult(ESPORTS_DEMO.fixtures, matchId, 0, 2));
      await page.locator('.undo-result-button').first().click();
      assert.equal(await page.locator('.simulate-button').count(), 3);
      assert.deepEqual(await page.locator('.standing-item').allInnerTexts(), before);
      await page.locator('.simulate-button').first().click();
      await page.locator('#home-score').fill('2');
      await page.locator('#away-score').fill('1');
      await page.getByRole('button', { name: 'Confirmar resultado' }).click();
      await page.getByRole('link', { name: /VER VITRINE PÚBLICA/ }).click();
      await page.locator('#real-app').waitFor();
      await page.waitForTimeout(1000);
      assert.equal(await page.locator('.simulate-button, .edit-result-button, .undo-result-button').count(), 0);
      const publicFixture = page.locator('.public-fixture').filter({ hasText: matchNames[0] }).filter({ hasText: matchNames[1] });
      assert.ok(await publicFixture.count() > 0, 'partida simulada visível na vitrine');
      assert.equal(await publicFixture.first().locator('.fixture-score').getAttribute('aria-label'), 'Placar 2 a 1');
      await page.screenshot({ path: resolve(captures, 'interactive-demo-public-390.png'), fullPage: true });
      await page.getByRole('link', { name: /Voltar à demonstração interativa/ }).first().click();
      assert.match(page.url(), /\/demonstracao$/);
      assert.equal(await page.locator('.simulate-button').count(), 2);
      await page.locator('#reset-demo').click();
      assert.equal(await page.locator('.simulate-button').count(), 3);
      assert.deepEqual(await page.locator('.standing-item').allInnerTexts(), before);
      await page.goto(`${base}/demonstracao/copa-tr-esports`, { waitUntil: 'networkidle' });
      const resetFixture = page.locator('.public-fixture').filter({ hasText: matchNames[0] }).filter({ hasText: matchNames[1] });
      assert.equal(await resetFixture.first().locator('.fixture-score').getAttribute('aria-label'), 'Sem placar');
      await page.goto(`${base}/painel`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.panel-layout').count(), 0, 'painel administrativo continua protegido');
    }
    console.log(`${width}px: layout, escudos e isolamento OK`);
    await context.close();
  }
} finally { await browser.close(); }

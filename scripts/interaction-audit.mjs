import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const out = resolve('captures/platform-audit-2026-10-25/interactions');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const cases = [];
try {
  for (const [width, height] of [[320, 568], [390, 780], [820, 1180], [1180, 820], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width <= 390, hasTouch: width <= 820, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    if (width <= 820) {
      await page.locator('#menu-toggle').click();
      assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#main-nav').isVisible(), true);
      await page.locator('#menu-toggle').click();
      assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
    }
    await page.goto(base + '/entrar', { waitUntil: 'domcontentloaded' });
    await page.locator('#login-form').waitFor();
    await page.locator('[data-password-toggle]').click();
    assert.equal(await page.locator('#login-form input[name="password"]').getAttribute('type'), 'text');
    await page.locator('#signup-toggle').click();
    assert.equal(await page.locator('#login-form input[name="display_name"]').count(), 1);
    await page.locator('#signup-toggle').click();
    await page.goto(base + '/demonstracao', { waitUntil: 'domcontentloaded' });
    await page.locator('#upcoming-matches .match-card').first().waitFor();
    const original = await page.locator('#standings-rows').innerText();
    await page.locator('.simulate-button').first().click();
    assert.equal(await page.locator('#score-dialog').evaluate(element => element.open), true);
    const dialog = await page.locator('#score-dialog').evaluate(element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }; });
    assert.ok(dialog.top >= -1 && dialog.bottom <= height + 1, `${width}: modal outside viewport ${JSON.stringify(dialog)}`);
    await page.locator('#home-score').fill('2');
    await page.locator('#away-score').fill('1');
    await page.locator('#score-form button[type="submit"]').click();
    assert.notEqual(await page.locator('#standings-rows').innerText(), original);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#upcoming-matches .match-card').first().waitFor();
    assert.ok(await page.locator('.edit-result-button').count() > 0, `${width}: simulated result not persisted`);
    await page.locator('.undo-result-button').first().click();
    assert.ok(await page.locator('.simulate-button').count() > 0);
    await page.goto(base + '/planejador', { waitUntil: 'domcontentloaded' });
    await page.locator('#planner-form').waitFor();
    await page.locator('#planner-form button[type="submit"]').click();
    assert.match(await page.locator('#plan-result').innerText(), /Grupos|grupos/);
    await page.locator('[data-action="draw"]').click();
    await page.locator('[data-action="confirm"]').click();
    await page.locator('[data-action="generate"]').click();
    assert.ok(await page.locator('.fixture-grid .fixture-card').count() > 0 || await page.locator('.fixture-grid').count() > 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${width}: planner overflow ${overflow}`);
    assert.deepEqual(errors, [], `${width}: JavaScript errors`);
    if ([390, 820, 1440].includes(width)) await page.screenshot({ path: resolve(out, `planejador-grupos-${width}.png`), animations: 'disabled' });
    cases.push({ width, height, dialog, plannerOverflow: overflow, menu: width <= 820, resultPersistence: true, plannerFlow: true, errors });
    console.log(`${width}px: menu, conta, placar, persistência local, sorteio, grupos e confrontos OK`);
    await context.close();
  }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(cases, null, 2));
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:45321/';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const widths = [320, 375, 390, 430, 768, 1024, 1440];
const showcase = ['dashboard', 'championships', 'matches', 'standings', 'statistics'];
const lab = ['config', 'matches', 'standings', 'portal'];
const organizer = ['dashboard', 'championships', 'teams', 'players', 'matches', 'classification', 'bracket', 'stats', 'champions', 'settings'];
const clubs = ['galatasarrafo', 'quack', 'vibe', 'facao', 'underdogs', 'maquina'];
const errors = [];
let checked = 0;

async function check(page, label, width) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = 'eager';
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    });
    const ready = await page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    if (ready) break;
    await page.waitForTimeout(200);
  }
  const state = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    zoom: visualViewport.scale,
    broken: [...document.images].filter((img) => !img.complete || !img.naturalWidth).map((img) => img.src),
  }));
  assert.ok(state.pageWidth <= width + 1, `${width}px ${label}: horizontal overflow ${state.pageWidth}`);
  assert.equal(state.zoom, 1, `${width}px ${label}: changed zoom`);
  assert.deepEqual(state.broken, [], `${width}px ${label}: broken image`);
  checked++;
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${width}px: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${width}px: ${message.text()}`); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    await check(page, 'homepage', width);
    await page.goto(`${base}demonstracao`, { waitUntil: 'domcontentloaded' });
    await page.locator('#showcase-tab-dashboard').waitFor();
    for (const tab of showcase) {
      await page.locator(`#showcase-tab-${tab}`).click();
      await check(page, `plataforma/${tab}`, width);
    }
    await page.locator('.lab-tab[data-tab="config"]').click();
    await page.locator('#load-example').click();
    await page.locator('#generate').click();
    for (const tab of lab) {
      await page.locator(`.lab-tab[data-tab="${tab}"]`).click();
      await check(page, `laboratorio/${tab}`, width);
      if (tab === 'matches') {
        const textColor = await page.locator('.match-team .club-link span').first().evaluate((element) => getComputedStyle(element).color);
        assert.equal(textColor, 'rgb(23, 47, 71)', `${width}px laboratory match contrast`);
      }
    }
    await page.goto(`${base}demonstracao#classificacao`, { waitUntil: 'domcontentloaded' });
    await page.locator('.tr-classification-content').waitFor();
    if (width === 1440) {
      await page.locator('[data-tr-top-page="matches"]').click();
      assert.equal(await page.locator('.tr-page h1').textContent(), 'Partidas');
      assert.equal(await page.locator('[data-tr-top-page="matches"]').getAttribute('class'), 'selected');
      await page.locator('[data-tr-top-page="classification"]').click();
      assert.ok(await page.locator('.tr-standings-card').isVisible());
    }
    for (const tab of organizer) {
      await page.locator(`[data-tr-page="${tab}"]`).click();
      await check(page, `organizador/${tab}`, width);
      if (tab === 'classification' && width <= 430) {
        const sizes = await page.evaluate(() => ({ hero: document.querySelector('.tr-team-hero').getBoundingClientRect().width, main: document.querySelector('.tr-classification-content').getBoundingClientRect().width }));
        assert.ok(sizes.hero >= sizes.main * .9, `${width}px organizer featured team card too narrow: ${JSON.stringify(sizes)}`);
      }
    }
    for (const club of clubs) {
      await page.goto(`${base}demonstracao#clube-esports-${club}`, { waitUntil: 'domcontentloaded' });
      await page.locator('.club-profile-stage04').waitFor();
      await check(page, `clube/${club}`, width);
    }
    console.log(`${width}px: 26 views, no page overflow`);
    await context.close();
  }
  assert.deepEqual(errors, [], `Console errors: ${errors.join(' | ')}`);
  assert.equal(checked, widths.length * 26);
  console.log(`Stage 06 responsive QA passed: ${checked} view/width checks, no console errors.`);
} finally {
  await browser.close();
}

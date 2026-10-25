import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const stage = process.argv[2] || 'after';
const out = resolve('captures/match-detail-2026-10-25');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const results = [];
try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width < 768 ? 850 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = await page.goto('http://127.0.0.1:45321/demonstracao/copa-tr-esports', { waitUntil: 'domcontentloaded' });
    assert.equal(start?.status(), 200);
    const link = page.locator('.public-featured .fixture-detail-link');
    await link.waitFor();
    const href = await link.getAttribute('href');
    await link.click();
    await page.locator('.public-detail-page .match-arena').waitFor();
    await page.evaluate(() => { for (const img of document.images) img.loading = 'eager'; });
    await page.waitForFunction(() => [...document.querySelectorAll('.public-detail-page .match-arena img')].every(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(() => {
      const rect = element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
      const teams = [...document.querySelectorAll('.public-detail-page .fixture-team')].map(team => ({
        name: team.querySelector('.fixture-team-name').textContent.trim(),
        crest: rect(team.querySelector('.fixture-crest-frame')),
        label: rect(team.querySelector('.fixture-team-name')),
        text: rect(team.querySelector('.fixture-team-name a, .fixture-team-name strong')),
        color: getComputedStyle(team.querySelector('.fixture-team-name a, .fixture-team-name strong')).color,
      }));
      return {
        width: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        href: location.pathname + location.search,
        score: rect(document.querySelector('.public-detail-page .fixture-score')),
        arena: rect(document.querySelector('.public-detail-page .match-arena')),
        info: rect(document.querySelector('.public-detail-data')),
        teams,
        brokenImages: [...document.querySelectorAll('.public-detail-page img')].filter(img => !img.naturalWidth).map(img => img.src),
        editControls: document.querySelectorAll('.public-detail-page input, .public-detail-page button, .public-detail-page form').length,
      };
    });
    results.push({ ...report, errors });
    await page.screenshot({ path: resolve(out, `${stage}-${width}.png`), fullPage: true, animations: 'disabled' });
    if (stage === 'after') {
      const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      assert.ok(report.href.includes('jogo='), `${width}: detail navigation failed`);
      assert.ok(report.pageWidth <= width + 1, `${width}: horizontal overflow`);
      assert.equal(report.brokenImages.length, 0, `${width}: broken images`);
      assert.equal(report.editControls, 0, `${width}: visitor edit controls`);
      assert.equal(errors.length, 0, `${width}: page error: ${errors.join('; ')}`);
      for (const team of report.teams) {
        assert.ok(team.text.width > 25 && team.text.height >= 15, `${width}: invisible label ${team.name}`);
        assert.ok(team.label.y >= team.crest.y + team.crest.height + 6, `${width}: label behind crest ${team.name}`);
        assert.ok(!overlaps(team.text, report.score), `${width}: label overlaps score ${team.name}`);
        assert.ok(team.text.x >= report.arena.x - 1 && team.text.x + team.text.width <= report.arena.x + report.arena.width + 1, `${width}: label clipped ${team.name}`);
        assert.match(team.color, /^rgb\((?:2[0-5]\d|1\d\d)/, `${width}: low contrast label ${team.name}`);
      }
      assert.ok(!overlaps(report.teams[0].text, report.teams[1].text), `${width}: team names overlap`);
      if (width === 320) {
        const longNames = await page.evaluate(() => {
          const labels = [...document.querySelectorAll('.match-detail-arena .fixture-team-name a, .match-detail-arena .fixture-team-name strong')];
          labels[0].textContent = 'ASSOCIAÇÃO ATLÉTICA GALATASARRAFO';
          labels[1].textContent = 'VIBE E-SPORTS FUTEBOL CLUBE';
          const arena = document.querySelector('.match-detail-arena').getBoundingClientRect();
          const score = document.querySelector('.match-detail-arena .fixture-score').getBoundingClientRect();
          return labels.map(label => {
            const text = label.getBoundingClientRect();
            const crest = label.closest('.fixture-team').querySelector('.fixture-crest-frame').getBoundingClientRect();
            return { belowCrest: text.top >= crest.bottom + 6, withinArena: text.bottom <= arena.bottom - 4, awayFromScore: text.left >= score.right || text.right <= score.left || text.top >= score.bottom || text.bottom <= score.top };
          });
        });
        assert.ok(longNames.every(name => name.belowCrest && name.withinArena && name.awayFromScore), '320: long team name layout');
      }
    }
    await page.close();
  }
  if (stage === 'after') {
    const context = await browser.newContext();
    const response = await context.request.get('http://127.0.0.1:45321/c/11111111-1111-4111-8111-111111111111');
    assert.equal(response.status(), 200, 'public competition route');
    assert.match(response.url(), /\/c\/11111111-1111-4111-8111-111111111111$/);
    assert.match(await response.text(), /id="real-app"/);
    await context.close();
  }
  await writeFile(resolve(out, `${stage}-metrics.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(({ width, pageWidth, teams, score, info }) => ({ width, pageWidth, labels: teams.map(team => ({ name: team.name, crestBottom: team.crest.y + team.crest.height, nameTop: team.label.y })), score, infoHeight: info.height })), null, 2));
} finally {
  await browser.close();
}

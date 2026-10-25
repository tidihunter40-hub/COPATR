import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const out = resolve('captures/platform-audit-2026-10-25/sports');
const widths = [320, 360, 375, 390, 393, 412, 430, 480, 600, 768, 800, 820, 834, 1024, 1180, 1280, 1366, 1440, 1536, 1600, 1920, 2560];
const demos = [['esports', '/demonstracao/copa-tr-esports'], ['grupos', '/demonstracao/copa-exemplo']];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const report = { widths, demos, cases: [] };

const inspect = () => {
  const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const overlap = (a, b) => a && b && a.x < b.right - 2 && a.right > b.x + 2 && a.y < b.bottom - 2 && a.bottom > b.y + 2;
  const visible = element => element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
  const arenas = [...document.querySelectorAll('.public-fixture.match-arena')].filter(visible).map((arena, i) => {
    const teams = [...arena.querySelectorAll('.fixture-team')];
    const score = arena.querySelector('.fixture-score');
    const scoreRect = score && rect(score);
    return {
      i,
      names: teams.map(team => team.querySelector('.fixture-team-name')?.textContent.trim()),
      nameBelowCrest: teams.every(team => {
        const crest = team.querySelector('.fixture-crest-frame');
        const name = team.querySelector('.fixture-team-name');
        return crest && name && rect(name).y >= rect(crest).bottom - 2;
      }),
      noScoreOverlap: teams.every(team => {
        const name = team.querySelector('.fixture-team-name');
        const crest = team.querySelector('.fixture-crest-frame');
        return name && crest && !overlap(rect(name), scoreRect) && !overlap(rect(crest), scoreRect);
      }),
      brokenCrests: [...arena.querySelectorAll('.fixture-crest-frame img')].filter(img => img.complete && !img.naturalWidth).map(img => img.src),
    };
  });
  const mobileStanding = document.querySelector('.standings-mobile');
  const desktopStanding = document.querySelector('.standings-scroll');
  return {
    viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    arenas, standings: {
      mobileVisible: visible(mobileStanding), desktopVisible: visible(desktopStanding),
      mobileRows: [...document.querySelectorAll('#classificacao .standing-mobile-row')].length,
      desktopRows: [...document.querySelectorAll('#classificacao .standings-scroll tbody tr:not([hidden])')].length,
    },
  };
};

try {
  for (const width of widths) {
    const height = width <= 480 ? (width <= 375 ? 568 : 780) : width <= 834 ? 1180 : 900;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', isMobile: width <= 480, hasTouch: width <= 834 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [name, path] of demos) {
      const beforeErrors = errors.length;
      try {
        const response = await page.goto(base + path, { waitUntil: 'domcontentloaded' });
        await page.locator('.public-featured .match-arena').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const portal = await page.evaluate(inspect);
        const detailLink = await page.locator('.public-featured .fixture-detail-link').getAttribute('href');
        if ([390, 820, 1440].includes(width)) {
          await page.locator('#jogos').screenshot({ path: resolve(out, `${name}-jogos-${width}.png`), animations: 'disabled' });
          await page.locator('#classificacao').screenshot({ path: resolve(out, `${name}-classificacao-${width}.png`), animations: 'disabled' });
        }
        const detailResponse = await page.goto(base + detailLink, { waitUntil: 'domcontentloaded' });
        await page.locator('.public-detail-page .match-detail-arena').waitFor();
        await page.evaluate(() => document.fonts.ready);
        const detail = await page.evaluate(inspect);
        if ([320, 375, 390, 430, 768, 1024, 1440].includes(width)) await page.locator('.public-detail-page').screenshot({ path: resolve(out, `${name}-detalhe-${width}.png`), animations: 'disabled' });
        report.cases.push({ width, height, name, status: response?.status(), detailStatus: detailResponse?.status(), detailPath: new URL(page.url()).pathname, portal, detail, errors: errors.slice(beforeErrors) });
      } catch (error) { report.cases.push({ width, height, name, error: error.message, errors: errors.slice(beforeErrors) }); }
    }
    console.log(`sports: ${width}px, ${report.cases.length} casos`);
    await context.close();
  }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  const failures = report.cases.filter(row => row.error || row.status !== 200 || row.detailStatus !== 200 || row.errors?.length || row.portal.documentWidth > row.width + 1 || row.detail.documentWidth > row.width + 1 || row.portal.arenas.some(arena => !arena.nameBelowCrest || !arena.noScoreOverlap || arena.brokenCrests.length) || row.detail.arenas.some(arena => !arena.nameBelowCrest || !arena.noScoreOverlap || arena.brokenCrests.length));
  console.log(JSON.stringify({ cases: report.cases.length, failures: failures.length, examples: failures.slice(0, 8), out }, null, 2));
} finally { await browser.close(); }

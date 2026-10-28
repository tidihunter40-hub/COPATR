import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.TR_QA_URL || 'https://copatr.vercel.app';
const out = process.env.TR_QA_OUT || 'captures/auditoria-lancamento-2026-10-27';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const findings = [];
try {
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const routes = [['inicio', '/'], ['campeonatos', '/campeonatos'], ['demonstracao', '/demonstracao']];
    if (process.env.TR_QA_COMPETITION_ID) routes.push(['corujao', `/c/${process.env.TR_QA_COMPETITION_ID}`]);
    for (const [name, route] of routes) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      if (route === '/campeonatos') await page.waitForFunction(() => !document.body.innerText.includes('Carregando campeonatos publicados'), null, { timeout: 10000 }).catch(() => {});
      if (name === 'corujao') {
        await page.locator('.public-competition h1').waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(() => {
          const text = document.body.innerText.toLowerCase();
          return text.includes('grupo a') && text.includes('grupo b');
        }, null, { timeout: 20000 });
      }
      await page.screenshot({ path: `${out}/public-${name}-${viewport.name}.png`, fullPage: true, animations: 'disabled' });
      const state = await page.evaluate(() => ({
        title: document.title,
        scrollWidth: document.documentElement.scrollWidth,
        brokenImages: [...document.images].filter((image) => { const box = image.getBoundingClientRect(); return box.width > 0 && box.height > 0 && image.complete && image.naturalWidth === 0; }).map((image) => image.currentSrc),
        groupA: document.body.innerText.toLowerCase().includes('grupo a'),
        groupB: document.body.innerText.toLowerCase().includes('grupo b'),
      }));
      findings.push({ name, viewport: viewport.name, status: response?.status(), ...state, errors });
      if (response?.status() !== 200 || state.scrollWidth > viewport.width + 1 || state.brokenImages.length || errors.length || (name === 'corujao' && (!state.groupA || !state.groupB))) {
        throw new Error(`Falha na prévia: ${viewport.name} ${route} ${JSON.stringify({ status: response?.status(), ...state, errors })}`);
      }
      await page.close();
    }
    await context.close();
  }
  await writeFile(`${out}/public-report.json`, JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings, null, 2));
} finally { await browser.close(); }

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const stage = process.argv[2] || 'before';
const base = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const out = resolve('captures/platform-audit-2026-10-25', stage);
await mkdir(out, { recursive: true });
const widths = [320, 360, 375, 384, 390, 393, 410, 412, 430, 480, 512, 600, 720, 768, 800, 820, 834, 1024, 1180, 1280, 1366, 1440, 1536, 1600, 1920, 2560];
const routes = [
  ['inicio', '/'], ['funcionalidades', '/funcionalidades'], ['como-funciona', '/como-funciona'],
  ['campeonatos', '/campeonatos'], ['planos', '/planos'], ['login', '/entrar'],
  ['demo-interativa', '/demonstracao'], ['demo-esports', '/demonstracao/copa-tr-esports'],
  ['demo-grupos', '/demonstracao/copa-exemplo'], ['planejador', '/planejador'],
  ['painel-anonimo', '/painel'], ['conta-anonima', '/minha-conta'],
];
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const report = { stage, widths, routes: routes.map(([name, path]) => ({ name, path })), cases: [], captures: [], startedAt: new Date().toISOString() };
try {
  for (const width of widths) {
    const height = width <= 480 ? (width <= 375 ? 640 : 780) : width <= 834 ? 1024 : 900;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', ignoreHTTPSErrors: true, isMobile: width <= 480, hasTouch: width <= 834 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__audit = { cls: 0, lcp: 0 };
      try {
        new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__audit.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__audit.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}
    });
    for (const [name, path] of routes) {
      const startErrorCount = errors.length;
      try {
        const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (name === 'demo-esports') await page.locator('.public-featured .match-arena').waitFor({ timeout: 8000 });
        if (name === 'demo-interativa') await page.locator('#upcoming-matches .match-card').first().waitFor({ timeout: 8000 });
        if (name === 'login') await page.locator('#login-form').waitFor({ timeout: 8000 });
        if (name === 'painel-anonimo' || name === 'conta-anonima') await page.waitForURL(/\/entrar\?retorno=/, { timeout: 8000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => {
          const visible = element => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
          const intentionalScroll = element => { for (let parent = element.parentElement; parent; parent = parent.parentElement) { const style = getComputedStyle(parent); if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1) return true; } return false; };
          const protruding = [...document.querySelectorAll('body *')].filter(visible).filter(element => { const rect = element.getBoundingClientRect(); return (rect.right > innerWidth + 2 || rect.left < -2) && !intentionalScroll(element); }).slice(0, 8).map(element => ({ tag: element.tagName, className: typeof element.className === 'string' ? element.className.slice(0, 80) : '', right: Math.round(element.getBoundingClientRect().right), left: Math.round(element.getBoundingClientRect().left) }));
          const controls = [...document.querySelectorAll('button, input, select, textarea, a')].filter(visible).filter(element => !element.matches('input[type="hidden"]'));
          const smallTargets = controls.filter(element => { const rect = element.getBoundingClientRect(); return (rect.width < 44 || rect.height < 44) && rect.top < innerHeight && rect.bottom > 0; }).slice(0, 8).map(element => ({ tag: element.tagName, text: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 36), width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
          const nav = performance.getEntriesByType('navigation')[0];
          return { viewport: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, title: document.title, protruding, smallTargets, brokenImages: [...document.images].filter(image => image.complete && !image.naturalWidth && visible(image)).map(image => image.getAttribute('src')).slice(0, 8), dclMs: Math.round(nav?.domContentLoadedEventEnd || 0), cls: Number(window.__audit?.cls?.toFixed(4) || 0), lcpMs: Math.round(window.__audit?.lcp || 0), loginForm: Boolean(document.querySelector('#login-form')), adminPanel: Boolean(document.querySelector('.panel-layout')) };
        });
        const row = { width, height, name, path, status: response?.status(), finalPath: new URL(page.url()).pathname, ...metrics, errors: errors.slice(startErrorCount) };
        report.cases.push(row);
        if ([390, 820, 1440].includes(width) && !['painel-anonimo', 'conta-anonima'].includes(name)) {
          const file = `${name}-${width}.png`;
          await page.screenshot({ path: resolve(out, file), animations: 'disabled', fullPage: false });
          report.captures.push(file);
        }
      } catch (error) {
        report.cases.push({ width, height, name, path, error: error.message, errors: errors.slice(startErrorCount) });
      }
    }
    console.log(`${stage}: ${width}px, ${report.cases.length} casos`);
    await context.close();
  }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  const failures = report.cases.filter(row => row.error || row.status !== 200 || row.viewport > row.width + 1 || row.documentWidth > row.width + 1 || row.brokenImages?.length || row.errors?.length);
  console.log(JSON.stringify({ stage, cases: report.cases.length, failures: failures.length, examples: failures.slice(0, 20).map(({ width, name, status, viewport, documentWidth, error, brokenImages, errors }) => ({ width, name, status, viewport, documentWidth, error, brokenImages, errors })), out }, null, 2));
} finally {
  await browser.close();
}

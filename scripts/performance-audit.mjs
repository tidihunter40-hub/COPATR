import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const origin = process.env.TR_QA_URL || 'http://127.0.0.1:45321';
const server = process.env.TR_QA_URL ? null : spawn(process.execPath, ['server.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
if (server) await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Servidor local encerrou: ${code}`)));
});
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const scenarios = [
  { name: 'mobile', width: 390, height: 844, cpu: 4, latency: 150, throughput: 1_600_000 / 8 },
  { name: 'desktop', width: 1440, height: 900, cpu: 1, latency: 0, throughput: -1 },
];

try {
  for (const scenario of scenarios.filter((item) => !process.env.TR_PERF_SCENARIO || item.name === process.env.TR_PERF_SCENARIO)) {
    for (const route of (process.env.TR_PERF_ROUTES?.split(',') || ['/', '/campeonatos', '/demonstracao'])) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const client = await context.newCDPSession(page);
      await client.send('Network.enable');
      await client.send('Network.setCacheDisabled', { cacheDisabled: true });
      await client.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu });
      if (scenario.latency) await client.send('Network.emulateNetworkConditions', {
        offline: false, latency: scenario.latency,
        downloadThroughput: scenario.throughput, uploadThroughput: scenario.throughput,
      });
      const responses = [];
      const graphicsMode = process.env.TR_GRAPHICS_MODE === 'performance' ? 'performance' : 'ultra';
      await page.addInitScript((selected) => {
        if (selected === 'performance') localStorage.setItem('tr-campeonatos-graphics-mode', selected);
      }, graphicsMode);
      page.on('response', async (response) => {
        if (!response.url().startsWith(origin)) return;
        const headers = response.headers();
        responses.push({ url: new URL(response.url()).pathname, type: headers['content-type'] || '', bytes: Number(headers['content-length'] || 0), status: response.status() });
      });
      await page.addInitScript(() => {
        window.__perf = { lcp: 0, cls: 0, shifts: [], heroHeights: [] };
        new MutationObserver(() => {
          const hero = document.querySelector('#inicio');
          if (!hero) return;
          requestAnimationFrame(() => {
            const height = Math.round(hero.getBoundingClientRect().height);
            const values = window.__perf.heroHeights;
            if (values.length < 10 && values.at(-1)?.height !== height) {
              values.push({ at: Math.round(performance.now()), height });
            }
          });
        }).observe(document, { childList: true, subtree: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__perf.lcp = entry.startTime;
            window.__perf.lcpElement = entry.element?.tagName + '.' + entry.element?.className;
            window.__perf.lcpUrl = entry.url || '';
            window.__perf.lcpBackground = entry.element ? getComputedStyle(entry.element).backgroundImage : '';
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) {
            window.__perf.cls += entry.value;
            window.__perf.shifts.push({ value: entry.value, sources: entry.sources?.map((source) => source.node?.tagName + '.' + source.node?.className).slice(0, 3) });
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const started = Date.now();
      const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (/^\/c\/[0-9a-f-]{36}$/i.test(route)) {
        await page.locator('.public-competition h1').waitFor({ state: 'visible', timeout: 30000 });
      }
      await page.waitForTimeout(4000);
      const metrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        const byType = { image: 0, javascript: 0, css: 0, font: 0 };
        for (const entry of resources) {
          const path = new URL(entry.name).pathname;
          if (/\.(?:avif|webp|png|jpe?g|svg)$/i.test(path)) byType.image += entry.transferSize;
          else if (/\.(?:m?js)$/i.test(path)) byType.javascript += entry.transferSize;
          else if (/\.css$/i.test(path)) byType.css += entry.transferSize;
          else if (/\.woff2?$/i.test(path)) byType.font += entry.transferSize;
        }
        return {
          ...window.__perf,
          domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,
          transferred: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
          resourceCount: resources.length,
          scrollWidth: document.documentElement.scrollWidth,
          heroHeight: Math.round(document.querySelector('#inicio')?.getBoundingClientRect().height || 0),
          overviewHeight: Math.round(document.querySelector('.public-overview')?.getBoundingClientRect().height || 0),
          largestResources: resources.sort((a, b) => b.transferSize - a.transferSize).slice(0, 8).map((entry) => ({ path: new URL(entry.name).pathname, bytes: entry.transferSize, kind: entry.initiatorType })),
          dataRequests: resources.filter((entry) => ['fetch', 'xmlhttprequest'].includes(entry.initiatorType) && new URL(entry.name).origin !== location.origin).map((entry) => ({ path: new URL(entry.name).pathname, startMs: Math.round(entry.startTime), endMs: Math.round(entry.responseEnd) })),
          byType,
        };
      });
      console.log(JSON.stringify({ scenario: scenario.name, graphicsMode, route, status: response?.status(), elapsedMs: Date.now() - started, ...metrics, largest: responses.sort((a, b) => b.bytes - a.bytes).slice(0, 6) }));
      await context.close();
    }
  }
} finally {
  await browser.close();
  server?.kill();
}

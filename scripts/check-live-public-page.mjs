import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 }, serviceWorkers: 'block' });
  await page.goto('http://127.0.0.1:45323/campeonatos', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.TRPublicHomeData), null, { timeout: 15000 });
  const state = await page.evaluate(() => ({ status: window.TRPublicHomeData.competitionsStatus, count: window.TRPublicHomeData.competitions.length, empty: Boolean(document.querySelector('.public-empty-state')), error: Boolean(document.querySelector('.public-data-notice')), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 }));
  console.log(`Página pública real: consulta ${state.status}; ${state.count} campeonato(s); estado vazio ${state.empty}; erro ${state.error}; rolagem ${state.horizontalOverflow}.`);
  assert.equal(state.status, 'ready');
  assert.equal(state.horizontalOverflow, false);
  assert.equal(state.empty, state.count === 0);
} finally { await browser.close(); }

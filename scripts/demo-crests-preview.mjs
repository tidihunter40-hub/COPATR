import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const names = [
  ['falcon', 'Falcão'], ['comet', 'Cometa'], ['crown', 'Coroa'], ['union', 'União'],
  ['thunder', 'Trovão'], ['tide', 'Maré'], ['summit', 'Montanha'], ['orbit', 'Órbita'],
];
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 680 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:45321/', { waitUntil: 'domcontentloaded' });
  await page.setContent(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:40px;background:#f5f7fb;color:#132f49;font:600 15px Arial,sans-serif}
    h1{margin:0 0 8px;font-size:31px}p{margin:0 0 27px;color:#435c72}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}
    .card{height:244px;display:grid;place-items:center;align-content:center;gap:11px;border:1px solid #ccdce8;border-radius:12px;background:linear-gradient(45deg,#eef2f6 25%,transparent 25%) 0 0/16px 16px,linear-gradient(-45deg,#eef2f6 25%,transparent 25%) 0 8px/16px 16px,linear-gradient(45deg,transparent 75%,#eef2f6 75%) 8px -8px/16px 16px,linear-gradient(-45deg,transparent 75%,#eef2f6 75%) -8px 0/16px 16px,#fff;box-shadow:0 4px 14px #14385314}
    img{width:110px;height:128px;object-fit:contain}.card strong{padding:5px 10px;border-radius:5px;background:#fff;color:#173d5a;font-size:14px}.tag{font-size:11px;color:#536b7f}
  </style><h1>Escudos fictícios demonstrativos</h1><p>Arte vetorial com fundo transparente. Aparece apenas quando não há escudo cadastrado.</p><div class="grid">${names.map(([file, label]) => `<div class="card"><img src="/assets/demo-crests/${file}.svg" alt="Escudo fictício ${label}"><strong>${label}</strong><span class="tag">DEMONSTRAÇÃO</span></div>`).join('')}</div></html>`);
  const decoded = await page.locator('.card img').evaluateAll(async (images) => Promise.all(images.map(async (image) => {
    try { await image.decode(); return image.naturalWidth === 192 && image.naturalHeight === 224; } catch { return false; }
  })));
  assert.equal(decoded.length, 8);
  assert.ok(decoded.every(Boolean), 'todos os oito escudos precisam carregar');
  await page.screenshot({ path: resolve('preview-stage032-crest-set.png'), fullPage: true });
  console.log('Oito escudos carregados; captura preview-stage032-crest-set.png criada.');
} finally {
  await browser.close();
}

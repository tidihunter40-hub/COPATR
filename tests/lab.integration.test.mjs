import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const html = readFileSync(resolve('dist/index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.FormData = dom.window.FormData;
globalThis.Event = dom.window.Event;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
dom.window.confirm = () => true;

await import(pathToFileURL(resolve('dist/app.mjs')).href);
await import(pathToFileURL(resolve('dist/showcase.js')).href);
await new Promise((resolveWait) => setTimeout(resolveWait, 40));

const submit = (form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

test('laboratório preserva criação, confrontos e classificação após a nova homepage', async () => {
  document.querySelector('#competition-name').value = 'Campeonato Integrado';
  submit(document.querySelector('#competition-form'));
  for (const name of ['Águias', 'Leões']) {
    document.querySelector('#team-name').value = name;
    submit(document.querySelector('#team-form'));
  }
  assert.equal(JSON.parse(localStorage.getItem('tr-campeonatos-demo-v1')).teams.length, 2);
  document.querySelector('#generate').click();
  assert.equal(document.querySelectorAll('.match-form').length, 1);
  const match = document.querySelector('.match-form');
  match.querySelector('[name="homeScore"]').value = '2';
  match.querySelector('[name="awayScore"]').value = '1';
  submit(match);
  document.querySelector('[data-tab="standings"]').click();
  const table = document.querySelector('.standings-table');
  assert.ok(table);
  assert.match(table.textContent, /Águias/);
  assert.match(table.textContent, /Leões/);
  assert.equal(JSON.parse(localStorage.getItem('tr-campeonatos-demo-v1')).fixtures[0].homeScore, 2);
  document.querySelectorAll('.showcase-source-switch button')[1].click();
  for (let attempt = 0; attempt < 30 && !document.querySelector('#power-root').textContent.includes('Dados da demonstração neste navegador'); attempt++) {
    window.dispatchEvent(new Event('tr:demo-updated'));
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  assert.match(document.querySelector('#power-root').textContent, /Dados da demonstração neste navegador/);
  assert.doesNotMatch(document.querySelector('#featured-root').textContent, /Campeonato Integrado/);
});

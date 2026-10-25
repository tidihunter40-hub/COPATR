import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="power-root"></div><div id="features-root"></div>
  <div id="sports-root"></div><div id="steps-root"></div>
  <div id="featured-root"></div><div id="plans-root"></div>
</body></html>`, { url: 'http://localhost/' });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

await import(pathToFileURL(resolve('dist/showcase.js')).href);
const settle = () => new Promise((resolveWait) => setTimeout(resolveWait, 40));
await settle();

test('abas exibem painéis interativos e dados fictícios identificados', async () => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  assert.equal(tabs.length, 5);
  assert.match(document.querySelector('#showcase-panel').textContent, /Copa TR Demonstração/);
  tabs[2].click();
  await settle();
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
  assert.match(document.querySelector('#showcase-panel').textContent, /Partidas/);
  assert.match(document.querySelector('#showcase-panel').textContent, /Rodada 1/);
  assert.doesNotMatch(document.querySelector('#showcase-panel').textContent, /Data e horário/);
  tabs[3].focus();
  tabs[3].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await settle();
  assert.equal(tabs[4].getAttribute('aria-selected'), 'true');
});

test('painel e campeonato refletem dados locais sem alterar o motor', async () => {
  const local = {
    name: 'Taça de Teste Local', sport: 'Futebol', format: 'single',
    teams: [{ id: 'a', name: 'Águias' }, { id: 'b', name: 'Leões' }],
    fixtures: [{ id: 'r1-1', round: 1, homeId: 'a', awayId: 'b', homeScore: 1, awayScore: 0, history: [] }],
  };
  localStorage.setItem('tr-campeonatos-demo-v1', JSON.stringify(local));
  window.dispatchEvent(new Event('tr:demo-updated'));
  await settle();
  document.querySelectorAll('.showcase-source-switch button')[1].click();
  await settle();
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs[1].click();
  await settle();
  assert.match(document.querySelector('#showcase-panel').textContent, /Taça de Teste Local/);
  assert.match(document.querySelector('#showcase-panel').textContent, /2 equipes/);
  assert.doesNotMatch(document.querySelector('#featured-root').textContent, /Taça de Teste Local/);
});

test('modalidade futura é identificada e cards respondem ao clique', async () => {
  const volleyball = [...document.querySelectorAll('.sport-atlas-card')].find((card) => card.textContent.includes('Vôlei'));
  assert.ok(volleyball);
  volleyball.click();
  await settle();
  assert.equal(volleyball.getAttribute('aria-pressed'), 'true');
  assert.match(document.querySelector('.sport-spotlight').textContent, /Sets, critérios específicos/);
  assert.match(document.querySelector('.sport-spotlight').textContent, /Disponibilidade futura/);
});

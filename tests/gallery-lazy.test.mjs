import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('galeria assina escudos apenas quando os cartões entram na área visível', async () => {
  const dom = new JSDOM('<div class="champions-empty"></div><div class="champions-filters"><select data-gallery-filter="sport"></select><select data-gallery-filter="competition"></select><select data-gallery-filter="season"></select><select data-gallery-filter="club"></select></div><p id="champion-count"></p>', { url: 'https://example.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.TR_CAMPEONATOS_SUPABASE_CONFIG = { url: 'https://example.supabase.co', anonKey: 'public-test-key' };
  let observer;
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target) { this.target = target; }
    unobserve() {}
    disconnect() {}
  };
  dom.window.IntersectionObserver = globalThis.IntersectionObserver;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return { ok: true, text: async () => JSON.stringify({ signedURL: '/object/sign/club-crests/example?token=test' }) };
  };
  const { renderChampionGallery } = await import('../dist/gallery-stage05.mjs');
  renderChampionGallery([{ place: 1, club: { id: 'club', official_name: 'Clube', crest_path: 'crest/path' }, season: { label: '2026', competition: { id: 'cup', name: 'Copa', sport: 'Futebol' } } }], 'ready');
  assert.equal(requests, 0);
  assert.ok(observer.target);
  observer.callback([{ isIntersecting: true, target: observer.target }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests, 1);
  assert.ok(document.querySelector('.champion-card-crest img'));
});

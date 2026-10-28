import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const html = readFileSync(resolve('dist/index.html'), 'utf8');
const document = new JSDOM(html).window.document;

test('navegação e ações locais apontam para seções existentes', () => {
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    const target = link.getAttribute('href').slice(1);
    if (target.startsWith('clube-')) { assert.ok(document.getElementById('club-profile-root'), 'Rota de clube sem perfil'); continue; }
    assert.ok(document.getElementById(target), `Destino ausente: #${target}`);
  }
  for (const id of ['power-root', 'features-root', 'sports-root', 'steps-root', 'galeria', 'plans-root', 'lab-content']) {
    assert.ok(document.getElementById(id), `Componente ausente: ${id}`);
  }
});

test('arquivos visuais e scripts locais referenciados existem', () => {
  for (const element of document.querySelectorAll('img[src], script[src], link[href^="/"]')) {
    const source = element.getAttribute('src') || element.getAttribute('href');
    if (!source.startsWith('/')) continue;
    assert.ok(existsSync(resolve('dist', source.slice(1))), `Arquivo ausente: ${source}`);
  }
  assert.doesNotMatch(html, /tr-campeonatos-brand\.png|tr-icon\.svg/);
});

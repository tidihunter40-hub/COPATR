import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { GET as login } from '../api/login.mjs';
import { GET as competition } from '../api/competition.mjs';
import { GET as runtimeConfig } from '../api/runtime-config.mjs';

test('login publicado remove credenciais da URL e mantém apenas retorno seguro', async () => {
  const response = await login(new Request('https://tr.example/entrar?email=teste%40example.com&senha=segredo&retorno=%2Fpainel'));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/entrar?retorno=%2Fpainel');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const page = await login(new Request('https://tr.example/entrar'));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="login-form"/);
});

test('rota pública publicada entrega HTML sem exigir login', async () => {
  const response = await competition(new Request('https://tr.example/c/11111111-1111-4111-8111-111111111111'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /id="real-app"/);
  const invalid = await competition(new Request('https://tr.example/c/invalido'));
  assert.equal(invalid.status, 404);
});

test('configuração publicada é dinâmica e rotas da Vercel preservam o aplicativo', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.outputDirectory, 'vercel-dist');
  assert.ok(config.rewrites.some(route => route.source === '/runtime-config.mjs' && route.destination === '/api/runtime-config'));
  assert.ok(config.rewrites.some(route => route.source === '/c/:id' && route.destination.includes('/api/competition')));
  const response = runtimeConfig();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /supabaseConfig/);
});

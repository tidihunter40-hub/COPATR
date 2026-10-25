import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const server = readFileSync(resolve('server.mjs'), 'utf8');
const page = readFileSync(resolve('dist/demo-competition.html'), 'utf8');
const script = readFileSync(resolve('dist/demo-competition.mjs'), 'utf8');
const serviceWorker = readFileSync(resolve('dist/sw.js'), 'utf8');

test('the sports demo has a separate navigable route and clear fictional disclosure', () => {
  assert.match(server, /demoCompetitionRoute = route === '\/demonstracao\/copa-tr-esports'/);
  assert.match(page, /DEMONSTRAÇÃO · DADOS FICTÍCIOS · NENHUM RESULTADO OFICIAL/);
  assert.match(page, /name="robots" content="noindex"/);
  assert.match(script, /publicPage\(client, competitionId, true\)/);
  assert.doesNotMatch(script, /createClient\(/);
  assert.match(serviceWorker, /'\/demo-competition\.html', '\/demo-competition\.mjs'/);
});

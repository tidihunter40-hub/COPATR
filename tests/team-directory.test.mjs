import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { filterTeamDirectory, normalizeTeamSearch } from '../dist/real-app.js';

test('pesquisa de equipes ignora maiúsculas, acentos e não oferece arquivadas', () => {
  const teams = [
    { official_name: 'Árvore FC', status: 'pending' },
    { official_name: 'Arena Digital', status: 'pending' },
    { official_name: 'Atlético Antigo', status: 'archived' },
  ];
  assert.equal(normalizeTeamSearch('ÁRVORE'), 'arvore');
  assert.deepEqual(filterTeamDirectory(teams, 'ar').map((team) => team.official_name), ['Árvore FC', 'Arena Digital']);
  assert.deepEqual(filterTeamDirectory(teams, 'ÁRVO').map((team) => team.official_name), ['Árvore FC']);
});

test('acesso público não registra organizadores pelo navegador', () => {
  const source = readFileSync('src/real-app.ts', 'utf8');
  assert.doesNotMatch(source, /auth\.signUp/);
  assert.match(source, /Solicitar acesso pelo WhatsApp/);
  assert.match(source, /approvedOrganizer\(profile\)/);
});

test('painel oferece equipes como área independente e seleção pesquisável', () => {
  const source = readFileSync('src/real-app.ts', 'utf8');
  assert.match(source, /href="\/painel\/equipes"/);
  assert.match(source, /Selecionar equipes participantes/);
  assert.match(source, /filterTeamDirectory\(candidateTeams/);
  assert.match(source, /club_name_snapshot: club\.official_name/);
});

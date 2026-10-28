import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DEFAULT_TEAM_SHIELD, filterTeamDirectory, normalizeTeamSearch, refreshEntryCrests, teamShieldMarkup } from '../dist/real-app.js';

test('escudo padrão é reutilizado para clubes sem imagem e imagem inválida pode cair no padrão', () => {
  assert.equal(DEFAULT_TEAM_SHIELD, '/assets/official/06_escudo_padrao_tr_campeonatos.webp');
  assert.match(teamShieldMarkup(null, 'Bonoco City'), /06_escudo_padrao_tr_campeonatos\.webp/);
  assert.match(teamShieldMarkup('https://example.test/crest.png', 'Bonoco City'), /https:\/\/example\.test\/crest\.png/);
  assert.match(teamShieldMarkup(null, 'Bonoco City'), /alt="Escudo de Bonoco City"/);
});

test('escudo atual acompanha o clube sem mudar identidade nem histórico da participação', async () => {
  const entries = [{ id: 'participacao-1', club_id: '11111111-1111-4111-8111-111111111111', club_name_snapshot: 'Bonoco City', crest_path_snapshot: 'antigo.png', final_position: 1 }];
  const client = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id: '11111111-1111-4111-8111-111111111111', crest_path: null }], error: null }) }) }) };
  await refreshEntryCrests(client, entries);
  assert.deepEqual(entries, [{ id: 'participacao-1', club_id: '11111111-1111-4111-8111-111111111111', club_name_snapshot: 'Bonoco City', crest_path_snapshot: null, final_position: 1 }]);
});

test('fundo público escolhido segue a identidade permanente da equipe', async () => {
  const entries = [{ id: 'participacao-2', club_id: '11111111-1111-4111-8111-111111111111', crest_path_snapshot: null }];
  const client = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id: '11111111-1111-4111-8111-111111111111', crest_path: null, public_background_id: 12 }], error: null }) }) }) };
  await refreshEntryCrests(client, entries);
  assert.equal(entries[0].public_background_id, 12);
});

test('cadastro e edição oferecem uma única escolha de fundo vinculada ao clube', () => {
  const source = readFileSync('src/real-app.ts', 'utf8');
  const initialMigration = readFileSync('supabase/migrations/202610260002_team_public_background.sql', 'utf8');
  const expansionMigration = readFileSync('supabase/migrations/202610260003_team_public_backgrounds_expand.sql', 'utf8');
  assert.match(source, /name="public_background_id"/);
  assert.match(source, /teamBackgroundChoiceMarkup\(team\.public_background_id\)/);
  assert.match(source, /public_background_id\s*\}\)\.select\('id'\)/);
  assert.match(source, /backgroundStyle/);
  assert.match(initialMigration, /public_background_id integer/);
  assert.match(expansionMigration, /between 1 and 20/);
});

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

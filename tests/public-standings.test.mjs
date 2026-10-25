import assert from 'node:assert/strict';
import test from 'node:test';
import { publicStandingsView } from '../dist/real-app.js';

const entries = new Map([
  ['a', { id: 'a', club_name_snapshot: 'Clube Azul', crest_path_snapshot: 'azul.png' }],
  ['b', { id: 'b', club_name_snapshot: 'Clube Branco', crest_path_snapshot: 'branco.png' }],
]);
const crests = new Map([['azul.png', '/original/azul.png'], ['branco.png', '/original/branco.png']]);
const rows = [
  { id: 'a', name: 'Clube Azul', points: 3, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 0, recent: ['V'] },
  { id: 'b', name: 'Clube Branco', points: 0, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 3, recent: ['D'] },
];
const matches = [
  { id: 'confirmed', status: 'confirmed', scheduled_at: '2026-10-15T21:30:00Z', home_entry_id: 'a', away_entry_id: 'b', home_score: 3, away_score: 0 },
  { id: 'pending', status: 'scheduled', scheduled_at: '2026-10-22T21:30:00Z', home_entry_id: 'a', away_entry_id: 'b', home_score: null, away_score: null },
];

test('classificação premium preserva escudos e mostra estatísticas calculadas', () => {
  const html = publicStandingsView(rows, entries, crests, matches, id => `/c/teste?jogo=${id}`);
  assert.match(html, /src="\/original\/azul.png"/);
  assert.match(html, /Escudo de Clube Azul/);
  assert.match(html, /<th scope="col">Apr\.<\/th>/);
  assert.match(html, /<td>100%<\/td>/);
  assert.match(html, /standing-leader-tag">Líder/);
  assert.match(html, /form-V/);
  assert.match(html, /form-D/);
  assert.match(html, /Histórico disponível/);
  assert.match(html, /jogo=confirmed/);
  assert.doesNotMatch(html, /jogo=pending/);
  assert.match(html, /standing-mobile-details/);
});

test('sem partida confirmada não anuncia líder ou aproveitamento inventado', () => {
  const empty = rows.map(row => ({ ...row, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, recent: [] }));
  const html = publicStandingsView(empty, entries, crests, matches.filter(match => match.status === 'scheduled'), id => `/c/teste?jogo=${id}`);
  assert.doesNotMatch(html, /standing-leader-tag/);
  assert.match(html, /Nenhuma partida confirmada/);
  assert.doesNotMatch(html, /100%/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFixture } from '../dist/real-app.js';

const homeId = '11111111-1111-4111-8111-111111111111';
const awayId = '22222222-2222-4222-8222-222222222222';
const entries = new Map([
  ['home', { id: 'home', club_id: homeId, club_name_snapshot: 'Falcões FC', crest_path_snapshot: 'home.png' }],
  ['away', { id: 'away', club_id: awayId, club_name_snapshot: 'Leões FC', crest_path_snapshot: 'away.png' }],
]);
const crests = new Map([['home.png', 'https://example.test/home.png'], ['away.png', 'https://example.test/away.png']]);
const match = (status, home_score, away_score) => ({ id: 'match', phase: 'league', round_number: 1, scheduled_at: null, home_entry_id: 'home', away_entry_id: 'away', home_score, away_score, status });

test('a confirmed win highlights only the winning crest', () => {
  const html = publicFixture(match('confirmed', 3, 0), entries, crests);
  assert.match(html, /fixture-team fixture-winner[^>]*><div class="fixture-crest-frame"><span class="team-shield team-shield--large"><img src="https:\/\/example.test\/home.png"/);
  assert.doesNotMatch(html, /fixture-team fixture-winner[^>]*><div class="fixture-crest-frame"><span class="team-shield team-shield--large"><img src="https:\/\/example.test\/away.png"/);
  assert.match(html, /Placar 3 a 0/);
});

test('a draw and an unplayed match have no winner', () => {
  const draw = publicFixture(match('confirmed', 1, 1), entries, crests);
  const scheduled = publicFixture(match('scheduled', null, null), entries, crests);
  assert.doesNotMatch(draw, /fixture-winner/);
  assert.match(draw, /Empate/);
  assert.doesNotMatch(scheduled, /fixture-winner|Vencedor/);
  assert.match(scheduled, /Sem placar/);
});

test('a shootout separates penalty goals and highlights the qualified team', () => {
  const html = publicFixture(match('confirmed', 1, 1), entries, crests, { home_score: 3, away_score: 4, winning_entry_id: 'away' });
  assert.match(html, /Placar 1 a 1/);
  assert.match(html, /Pênaltis: 3 × 4/);
  assert.match(html, /fixture-team fixture-winner[^>]*><div class="fixture-crest-frame"><span class="team-shield team-shield--large"><img src="https:\/\/example.test\/away.png"/);
});

test('match card links to its public detail without changing the official result', () => {
  const html = publicFixture(match('confirmed', 3, 0), entries, crests, undefined, '/c/competition?temporada=season&jogo=match');
  assert.match(html, /detalhes da partida/i);
  assert.match(html, /temporada=season&amp;jogo=match/);
  assert.match(html, /data-fixture-status="confirmed"/);
  assert.match(html, /Placar 3 a 0/);
});

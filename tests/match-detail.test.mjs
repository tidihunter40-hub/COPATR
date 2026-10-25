import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFixture, publicMatchDetailData } from '../dist/real-app.js';

const entries = new Map([
  ['home', { id: 'home', club_name_snapshot: 'Equipe Azul' }],
  ['away', { id: 'away', club_name_snapshot: 'Equipe Prata' }],
]);
const match = { id: 'game', phase: 'quarterfinal', round_number: 2, scheduled_at: '2026-10-25T20:30:00Z', home_entry_id: 'home', away_entry_id: 'away', home_score: 2, away_score: 1, status: 'confirmed' };

test('detalhes mostram fase, resultado confirmado e apenas classificação registrada', () => {
  const nextMatch = { phase: 'semifinal', home_entry_id: 'home', away_entry_id: 'another' };
  const detail = publicMatchDetailData(match, null, [], entries, [match, nextMatch]);
  assert.match(detail, /Quartas de final/);
  assert.match(detail, /Resultado confirmado/);
  assert.match(detail, /Equipe Azul avança para a semifinal/);
  assert.doesNotMatch(publicMatchDetailData(match, null, [], entries, [match]), /avança para/);
  assert.match(publicFixture(match, entries, new Map(), undefined, undefined, true), /Placar 2 a 1/);
});

test('campos e seções sem dados ficam ocultos', () => {
  const scheduled = { ...match, status: 'scheduled', phase: 'league', round_number: null, scheduled_at: null, home_score: null, away_score: null };
  const detail = publicMatchDetailData(scheduled, null, [], entries, [scheduled]);
  const arena = publicFixture(scheduled, entries, new Map(), undefined, undefined, true);
  assert.match(detail, /Liga/);
  assert.match(detail, /Agendada/);
  assert.doesNotMatch(detail, /<dt>Rodada|<dt>Data e horário|Lances registrados|avança para/);
  assert.doesNotMatch(arena, /fixture-bottom|Data a definir/);
});

test('lances registrados mostram jogador e cartões sem injetar HTML', () => {
  const detail = publicMatchDetailData(match, null, [
    { entry_id: 'home', event_type: 'goal', minute: 32, payload: { player_name: 'Ana <script>' } },
    { entry_id: 'away', event_type: 'yellow_card', minute: 55, payload: {} },
    { entry_id: 'home', event_type: 'note', minute: 60, payload: { player_name: 'Nota interna' } },
  ], entries, [match]);
  assert.match(detail, /Ana &lt;script&gt;/);
  assert.match(detail, /Cartão amarelo/);
  assert.doesNotMatch(detail, /Nota interna|<script>/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFixtures, updateResult, calculateStandings, validateTeamName, validateScore } from '../dist/engine.mjs';

const teams = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Equipe ${i + 1}` }));

for (const count of [4, 5, 8]) {
  test(`${count} equipes têm confrontos únicos e folgas corretas`, () => {
    const entries = teams(count);
    const fixtures = generateFixtures(entries);
    const rounds = count % 2 ? count : count - 1;
    assert.equal(fixtures.length, count * (count - 1) / 2);
    assert.equal(new Set(fixtures.map((m) => [m.homeId, m.awayId].sort().join('|'))).size, fixtures.length);
    for (let round = 1; round <= rounds; round += 1) {
      const playing = fixtures.filter((m) => m.round === round).flatMap((m) => [m.homeId, m.awayId]);
      assert.equal(playing.length, count % 2 ? count - 1 : count);
      assert.equal(new Set(playing).size, playing.length);
    }
  });
}

test('returno espelha cada confronto com mandos trocados', () => {
  const first = generateFixtures(teams(5));
  const both = generateFixtures(teams(5), true);
  assert.equal(both.length, first.length * 2);
  for (const match of first) {
    const reverse = both.find((m) => m.round === match.round + 5 && m.homeId === match.awayId && m.awayId === match.homeId);
    assert.ok(reverse);
  }
});

test('placar salvo e corrigido recalcula a classificação e guarda histórico', () => {
  const entries = teams(4);
  let fixtures = generateFixtures(entries);
  const first = fixtures[0];
  fixtures = updateResult(fixtures, first.id, 3, 0, '2026-01-01T00:00:00.000Z');
  let home = calculateStandings(entries, fixtures).find((row) => row.id === first.homeId);
  assert.equal(home.points, 3);
  assert.equal(home.goalDifference, 3);
  fixtures = updateResult(fixtures, first.id, 1, 1, '2026-01-02T00:00:00.000Z');
  home = calculateStandings(entries, fixtures).find((row) => row.id === first.homeId);
  assert.equal(home.points, 1);
  assert.equal(home.draws, 1);
  assert.equal(home.goalDifference, 0);
  assert.deepEqual(fixtures[0].history.map(({ homeScore, awayScore }) => [homeScore, awayScore]), [[3, 0]]);
});

test('desempate respeita pontos, vitórias, saldo e gols marcados', () => {
  const entries = teams(3);
  const fixtures = [
    { id: 'a', homeId: 't1', awayId: 't2', homeScore: 2, awayScore: 0 },
    { id: 'b', homeId: 't2', awayId: 't3', homeScore: 1, awayScore: 0 },
  ];
  assert.deepEqual(calculateStandings(entries, fixtures).map((row) => row.id), ['t1', 't2', 't3']);
});

test('entradas inválidas são rejeitadas', () => {
  assert.throws(() => generateFixtures(teams(1)));
  assert.throws(() => generateFixtures(teams(33)));
  assert.throws(() => generateFixtures([{ id: 'a' }, { id: 'a' }]));
  assert.throws(() => validateTeamName(' equipe 1 ', teams(2)));
  assert.throws(() => validateScore(-1));
  assert.throws(() => validateScore('2.5'));
  assert.throws(() => updateResult([], 'missing', 1, 0));
});

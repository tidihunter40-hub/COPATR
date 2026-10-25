import test from 'node:test';
import assert from 'node:assert/strict';
import { corujaoPlan, corujaoQualifiers, groupPlan, knockoutPlan, recommendCorujao, resolveKnockoutBracket, resolvedWinner, roundRobinPlan, scheduleFixtures, standings, validateFixtureSchedule, validateParticipants } from '../dist/tr-competition-engine.mjs';

const teams = (count) => Array.from({ length: count }, (_, index) => ({ id: `t${index + 1}`, name: `Equipe ${String(index + 1).padStart(2, '0')}` }));

for (const count of [4, 8, 10, 20, 5]) for (const legs of [1, 2, 3]) {
  test(`liga ${count} equipes, ${legs} turno(s)`, () => {
    const plan = roundRobinPlan(teams(count), legs);
    assert.equal(plan.matchCount, legs * count * (count - 1) / 2);
    assert.equal(plan.rounds, legs * (count % 2 ? count : count - 1));
    for (let round = 1; round <= plan.rounds; round++) {
      const playing = plan.fixtures.filter((match) => match.round === round).flatMap((match) => [match.homeId, match.awayId]);
      assert.equal(playing.length, 2 * Math.floor(count / 2));
      assert.equal(new Set(playing).size, playing.length);
    }
  });
}

for (const size of [3, 4, 5]) for (const legs of [1, 2]) {
  test(`grupos de ${size}, ${legs} turno(s)`, () => {
    const all = teams(size * 2);
    const plan = groupPlan([{ id: 'A', teams: all.slice(0, size) }, { id: 'B', teams: all.slice(size) }], { legs, requireChampionRule: false });
    assert.equal(plan.matchCount, 2 * legs * size * (size - 1) / 2);
    assert.equal(new Set(plan.fixtures.map((match) => match.id)).size, plan.fixtures.length);
    assert.throws(() => groupPlan([{ id: 'A', teams: all.slice(0, size) }, { id: 'B', teams: all.slice(size) }] ), /campeão/);
  });
}

for (const count of [2, 4, 8, 16, 32]) {
  test(`mata-mata começa na fase certa com ${count} classificados`, () => {
    const plan = knockoutPlan(teams(count));
    assert.equal(plan.preliminary.length, 0);
    assert.equal(plan.rounds[0].matches.length, count / 2);
    assert.equal(plan.matchCount, count - 1);
    assert.equal(plan.rounds.at(-1).name, 'Final');
  });
}

test('12 equipes requerem avanços explícitos e preservam referências de vencedor', () => {
  assert.throws(() => knockoutPlan(teams(12)), /avanços automáticos/);
  const plan = knockoutPlan(teams(12), { allowByes: true });
  assert.equal(plan.preliminary.length, 4);
  assert.equal(plan.directAdvances, 4);
  assert.equal(plan.rounds[0].name, 'Quartas de final');
  assert.equal(plan.matchCount, 11);
  assert.equal(plan.rounds[0].matches.filter((match) => match.home.winnerOf || match.away.winnerOf).length, 4);
});

test('classificação usa pontuação configurada e desempate de três equipes em minitabela', () => {
  const entries = teams(4);
  const fixtures = [
    { homeId: 't1', awayId: 't2', homeScore: 1, awayScore: 0 },
    { homeId: 't2', awayId: 't3', homeScore: 2, awayScore: 0 },
    { homeId: 't3', awayId: 't1', homeScore: 3, awayScore: 1 },
  ];
  const table = standings(entries, fixtures, { win: 2, draw: 1, loss: 0, tiebreakers: ['points', 'headToHeadGoalDifference', 'name'] });
  assert.deepEqual(table.slice(0, 3).map((row) => row.id), ['t2', 't3', 't1']);
  assert.equal(table[0].points, 2);
});

test('empate eliminatório não inventa classificado', () => {
  const match = { homeId: 't1', awayId: 't2', homeScore: 1, awayScore: 1, status: 'confirmed' };
  assert.equal(resolvedWinner(match), null);
  assert.equal(resolvedWinner(match, { penalties: { homeScore: 4, awayScore: 3 } }), 't1');
});

test('chaveamento só avança vencedores confirmados e protege partida posterior concluída', () => {
  const plan = knockoutPlan(teams(4), { thirdPlace: true });
  let bracket = resolveKnockoutBracket(plan, []);
  assert.equal(bracket.championId, null);
  const semifinals = bracket.rounds[0].matches.map((match) => ({ id: match.id, homeId: match.homeId, awayId: match.awayId, homeScore: 2, awayScore: 0, status: 'confirmed' }));
  bracket = resolveKnockoutBracket(plan, semifinals);
  assert.equal(bracket.rounds[1].matches[0].homeId, semifinals[0].homeId);
  assert.equal(bracket.rounds[1].matches[0].awayId, semifinals[1].homeId);
  assert.equal(bracket.thirdPlace.homeId, semifinals[0].awayId);
  const final = bracket.rounds[1].matches[0];
  const finalResult = { id: final.id, homeId: final.homeId, awayId: final.awayId, homeScore: 1, awayScore: 0, status: 'confirmed' };
  assert.equal(resolveKnockoutBracket(plan, [...semifinals, finalResult]).championId, final.homeId);
  assert.throws(() => resolveKnockoutBracket(plan, [{ ...semifinals[0], homeScore: 0, awayScore: 2 }, semifinals[1]], { existingMatches: [finalResult] }), /revisão administrativa/);
});

for (let count = 8; count <= 32; count++) {
  test(`Corujão com ${count} equipes valida disponibilidade e formato`, () => {
    const advice = recommendCorujao(count);
    if (count % 2) { assert.equal(advice.status, 'incompatible'); assert.throws(() => corujaoPlan(teams(count))); return; }
    if (![8, 10, 12, 16, 18, 20, 24, 28, 32].includes(count)) { assert.equal(advice.status, 'attention'); assert.throws(() => corujaoPlan(teams(count))); return; }
    const plan = corujaoPlan(teams(count));
    assert.equal(plan.fixtures.length, 3 * count / 2);
    const verified = validateFixtureSchedule(plan.fixtures, teams(count), { rounds: 3, matchesPerTeam: 3, noByes: true });
    assert.equal(verified.matchCount, advice.groupMatches);
    assert.ok([4, 8, 16].includes(advice.advances));
    assert.ok(advice.advances < count);
    assert.equal(advice.totalMatches, advice.groupMatches + advice.advances - 1);
    for (let round = 1; round <= 3; round++) assert.equal(plan.fixtures.filter((match) => match.round === round).length, count / 2);
  });
}

test('Corujão indica falta de estações para simultaneidade', () => {
  const advice = recommendCorujao(20, { stations: 5, matchMinutes: 20, intervalMinutes: 10 });
  assert.equal(advice.synchronized, false);
  assert.equal(advice.waves, 2);
  assert.match(advice.warnings.join(' '), /não permitem/);
  assert.equal(advice.status, 'incompatible');
});

test('agenda sincronizada respeita salas, horário inicial e intervalo', () => {
  const plan = corujaoPlan(teams(8));
  assert.throws(() => scheduleFixtures(plan.fixtures, { startAt: '2026-10-24T20:00:00-03:00', matchMinutes: 20, intervalMinutes: 10, stations: 3, synchronizedRounds: true }), /exigem 4 estações/);
  const schedule = scheduleFixtures(plan.fixtures, { startAt: '2026-10-24T20:00:00-03:00', matchMinutes: 20, intervalMinutes: 10, stations: 4, synchronizedRounds: true });
  assert.equal(schedule.fixtures.length, 12);
  assert.equal(new Set(schedule.fixtures.filter((match) => match.round === 1).map((match) => match.scheduledAt)).size, 1);
  assert.equal(schedule.fixtures.filter((match) => match.round === 2)[0].scheduledAt, '2026-10-24T23:30:00.000Z');
  assert.equal(schedule.endsAt, '2026-10-25T00:20:00.000Z');
});

test('Corujão de oito exige resultados confirmados e regulamento para classificar', () => {
  const plan = corujaoPlan(teams(8));
  assert.throws(() => corujaoQualifiers(plan, []), /Defina pontuação/);
  const results = plan.fixtures.map((match) => ({ ...match, homeScore: Number(match.homeId.slice(1)) < Number(match.awayId.slice(1)) ? 2 : 0, awayScore: Number(match.homeId.slice(1)) < Number(match.awayId.slice(1)) ? 0 : 2, status: 'confirmed' }));
  const qualified = corujaoQualifiers(plan, results, { rules: { win: 3, draw: 1, loss: 0, tiebreakers: ['points', 'wins', 'goalDifference', 'goalsFor'] }, crossGroupTiebreakers: [] });
  assert.equal(qualified.qualifiers.length, 4);
  assert.equal(new Set(qualified.qualifiers.map((row) => row.id)).size, 4);
});

test('Corujão de vinte bloqueia empate na última vaga entre grupos', () => {
  const plan = corujaoPlan(teams(20));
  const results = plan.fixtures.map((match) => ({ ...match, homeScore: 0, awayScore: 0, status: 'confirmed' }));
  assert.throws(() => corujaoQualifiers(plan, results, { rules: { win: 3, draw: 1, loss: 0, tiebreakers: ['points', 'wins', 'goalDifference', 'goalsFor'] }, crossGroupTiebreakers: ['points', 'goalDifference'] }), /Empate/);
});

for (const count of [8, 10, 12, 16, 18, 20, 24, 28, 32]) {
  test(`Corujão de ${count} seleciona somente classificados do regulamento`, () => {
    const plan = corujaoPlan(teams(count));
    const strength = (id) => { const position = Number(id.slice(1)); return 99 - 2 * position - Math.floor(position * position / 40); };
    const completed = plan.fixtures.map((match) => ({ ...match, homeScore: strength(match.homeId), awayScore: strength(match.awayId), status: 'confirmed' }));
    const selected = corujaoQualifiers(plan, completed, { rules: { win: 3, draw: 1, loss: 0, tiebreakers: ['points', 'wins', 'goalDifference', 'goalsFor'] }, crossGroupTiebreakers: ['points', 'wins', 'goalDifference', 'goalsFor'] });
    assert.equal(selected.qualifiers.length, plan.recommendation.advances);
    assert.equal(new Set(selected.qualifiers.map((row) => row.id)).size, selected.qualifiers.length);
  });
}

test('participantes e agenda inválidos são rejeitados', () => {
  assert.throws(() => validateParticipants([{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }]));
  assert.throws(() => validateFixtureSchedule([{ homeId: 't1', awayId: 't2', round: 1 }, { homeId: 't1', awayId: 't3', round: 1 }], teams(3)), /duas vezes/);
});

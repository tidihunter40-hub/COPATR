import assert from 'node:assert/strict';
import test from 'node:test';
import { ESPORTS_DEMO } from '../dist/esports-demo.mjs';

test('Copa TR Demonstração keeps six supplied crests and fifteen unique fixtures', () => {
  assert.equal(ESPORTS_DEMO.name, 'COPA TR DEMONSTRAÇÃO 2026');
  assert.equal(ESPORTS_DEMO.teams.length, 6);
  assert.equal(ESPORTS_DEMO.fixtures.length, 15);
  assert.ok(ESPORTS_DEMO.teams.every((team) => team.demoAsset.startsWith('/assets/demo-teams/')));
  const pairs = ESPORTS_DEMO.fixtures.map((fixture) => [fixture.homeId, fixture.awayId].sort().join('|'));
  assert.equal(new Set(pairs).size, 15);
  const played = ESPORTS_DEMO.fixtures.filter((fixture) => fixture.homeScore !== null);
  assert.equal(played.length, 3);
  assert.ok(played.every((fixture) => fixture.round === 1));
  const name = (id) => ESPORTS_DEMO.teams.find((team) => team.id === id)?.name;
  const results = played.map((fixture) => `${name(fixture.homeId)} ${fixture.homeScore} x ${fixture.awayScore} ${name(fixture.awayId)}`);
  assert.deepEqual(results, [
    'BONOCO CITY 2 x 1 GAROTOS DE POMBAL',
    'RESENHA CLUBE 1 x 1 OS SUPERSTAIS',
    'IRMANDADE ES 0 x 3 ÁGUIA ES',
  ]);
});

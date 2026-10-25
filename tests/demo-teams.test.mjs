import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { DEMO_TEAMS } from '../dist/demo-teams.mjs';
import { ESPORTS_DEMO } from '../dist/esports-demo.mjs';
import { calculateStandings } from '../dist/engine.mjs';

const expected = [
  ['BONOCO CITY', '/assets/demo-teams/01_Bonoco_City.png'],
  ['RESENHA CLUBE', '/assets/demo-teams/02_Resenha_Clube.png'],
  ['IRMANDADE ES', '/assets/demo-teams/03_Irmandade_ES.png'],
  ['ÁGUIA ES', '/assets/demo-teams/04_Aguia_ES.png'],
  ['OS SUPERSTAIS', '/assets/demo-teams/05_Os_Superstais.png'],
  ['GAROTOS DE POMBAL', '/assets/demo-teams/06_Garotos_de_Pombal.png'],
];

test('escudos fornecidos são PNGs RGBA e a identidade demonstrativa é centralizada', () => {
  assert.deepEqual(DEMO_TEAMS.map(({ name, demoAsset }) => [name, demoAsset]), expected);
  for (const team of DEMO_TEAMS) {
    const localPath = `dist${team.demoAsset}`;
    assert.equal(existsSync(localPath), true, `${team.name}: arquivo ausente`);
    const png = readFileSync(localPath);
    assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71], `${team.name}: não é PNG`);
    assert.equal(png[25], 6, `${team.name}: PNG precisa preservar canal alfa RGBA`);
  }
  assert.equal(ESPORTS_DEMO.teams, DEMO_TEAMS);
});

test('a primeira rodada com seis equipes é consistente e não inventa confrontos extras', () => {
  const confirmed = ESPORTS_DEMO.fixtures.filter((fixture) => fixture.homeScore !== null);
  assert.equal(confirmed.length, 3);
  assert.ok(confirmed.every((fixture) => fixture.round === 1));
  const standings = calculateStandings(DEMO_TEAMS, ESPORTS_DEMO.fixtures);
  assert.equal(standings.length, 6);
  assert.ok(standings.every((row) => row.played === 1));
  assert.equal(standings.reduce((sum, row) => sum + row.goalsFor, 0), standings.reduce((sum, row) => sum + row.goalsAgainst, 0));
});

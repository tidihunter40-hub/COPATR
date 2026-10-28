import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { DEMO_TEAMS } from '../dist/demo-teams.mjs';
import { ESPORTS_DEMO } from '../dist/esports-demo.mjs';
import { calculateStandings } from '../dist/engine.mjs';

const expected = [
  ['BONOCO CITY', '/assets/demo-teams/01_Bonoco_City-256.webp'],
  ['RESENHA CLUBE', '/assets/demo-teams/02_Resenha_Clube-256.webp'],
  ['IRMANDADE ES', '/assets/demo-teams/03_Irmandade_ES-256.webp'],
  ['ÁGUIA ES', '/assets/demo-teams/04_Aguia_ES-256.webp'],
  ['OS SUPERSTAIS', '/assets/demo-teams/05_Os_Superstais-256.webp'],
  ['GAROTOS DE POMBAL', '/assets/demo-teams/06_Garotos_de_Pombal-256.webp'],
];

test('escudos demonstrativos usam WebP menor que os originais sem trocar identidade', () => {
  assert.deepEqual(DEMO_TEAMS.map(({ name, demoAsset }) => [name, demoAsset]), expected);
  for (const team of DEMO_TEAMS) {
    const localPath = `dist${team.demoAsset}`;
    assert.equal(existsSync(localPath), true, `${team.name}: arquivo ausente`);
    const webp = readFileSync(localPath);
    const original = readFileSync(localPath.replace(/-256\.webp$/, '.png'));
    assert.equal(webp.toString('ascii', 0, 4), 'RIFF', `${team.name}: contêiner WebP inválido`);
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP', `${team.name}: não é WebP`);
    assert.ok(webp.length < original.length / 5, `${team.name}: versão de exibição pesada`);
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

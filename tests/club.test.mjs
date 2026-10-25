import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFixtures, updateResult, calculateStandings } from '../dist/engine.mjs';
import { clubJourney, detectCrestType, readCrestFile, safeCrestUrl } from '../dist/club.mjs';

const teams = [{ id: 'a', name: 'Águias' }, { id: 'b', name: 'Leões' }, { id: 'c', name: 'Tigres' }];

test('trajetória segue resultados corrigidos sem duplicar gols ou jogos', () => {
  let matches = generateFixtures(teams, true);
  const first = matches.find((match) => match.homeId === 'a' || match.awayId === 'a');
  matches = updateResult(matches, first.id, 2, 1);
  matches = updateResult(matches, first.id, 1, 1);
  const journey = clubJourney(teams, matches, 'a');
  assert.equal(journey.length, 4);
  assert.equal(journey.filter((item) => item.played).length, 1);
  assert.equal(journey.find((item) => item.id === first.id).outcome, 'Empate');
  assert.equal(journey.filter((item) => !item.played).length, 3);
  const row = calculateStandings(teams, matches).find((entry) => entry.id === 'a');
  assert.equal(row.played, 1);
  assert.equal(row.goalsFor, 1);
  assert.equal(row.goalsAgainst, 1);
});

test('escudo exige formato raster verdadeiro e URL segura', async () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  assert.equal(detectCrestType(png), 'image/png');
  const file = { name: 'escudo.png', type: 'image/png', size: png.length, arrayBuffer: async () => png.buffer };
  const url = await readCrestFile(file);
  assert.equal(safeCrestUrl(url), url);
  await assert.rejects(readCrestFile({ ...file, name: 'escudo.jpg' }), /Arquivo inválido/);
  assert.equal(safeCrestUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
});

import { generateFixtures, updateResult } from './engine.mjs';

// Read-only visual scenario. The supplied image files are copied byte-for-byte.
export const ESPORTS_TEAMS = [
  { id: 'esports-quack', name: 'QUACK E-SPORTS', demoAsset: '/assets/demo-esports/quack.jpeg' },
  { id: 'esports-galatasarrafo', name: 'GALATASARRAFO', demoAsset: '/assets/demo-esports/galatasarrafo.jpe' },
  { id: 'esports-vibe', name: 'VIBE E-SPORTS', demoAsset: '/assets/demo-esports/vibe.jpeg' },
  { id: 'esports-facao', name: 'FACÃO SEM CABO', demoAsset: '/assets/demo-esports/facao.jpeg' },
  { id: 'esports-underdogs', name: 'UNDERDOGS E-SPORTS', demoAsset: '/assets/demo-esports/underdogs.webp' },
  { id: 'esports-maquina', name: 'MÁQUINA E-SPORTS', demoAsset: '/assets/demo-esports/maquina.png' },
];

const schedule = generateFixtures(ESPORTS_TEAMS).map((match) => ({ ...match, round: match.round === 1 ? 2 : match.round === 2 ? 1 : match.round, ...(match.id === 'r2-3' ? { homeId: match.awayId, awayId: match.homeId } : {}) }));
// Results belong only to this in-memory example. Round one stays upcoming so
// its three fixtures show all six supplied identities in the panel.
const results = [[3, 2, 1], [4, 1, 1], [5, 3, 0]];
const fixtures = results.reduce((list, [index, home, away]) => updateResult(list, schedule[index].id, home, away, '2026-10-22T00:00:00.000Z'), schedule);

export const ESPORTS_DEMO = Object.freeze({
  name: 'COPA TR E-SPORTS 2026', sport: 'E-sports', format: 'single',
  teams: ESPORTS_TEAMS, fixtures,
});

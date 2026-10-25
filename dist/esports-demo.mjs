import { generateFixtures, updateResult } from './engine.mjs';
import { DEMO_TEAMS } from './demo-teams.mjs';

// Read-only visual scenario. The supplied PNG files are copied byte-for-byte.
export const ESPORTS_TEAMS = DEMO_TEAMS;

const schedule = generateFixtures(ESPORTS_TEAMS);
// Three confirmed fixtures form a mathematically consistent first round; the
// remaining twelve are scheduled and never affect the live standings.
const results = [[0, 2, 1], [1, 1, 1], [2, 0, 3]];
const fixtures = results.reduce((list, [index, home, away]) => updateResult(list, schedule[index].id, home, away, '2026-10-22T00:00:00.000Z'), schedule);

export const ESPORTS_DEMO = Object.freeze({
  name: 'COPA TR DEMONSTRAÇÃO 2026', sport: 'Futebol', format: 'single',
  teams: ESPORTS_TEAMS, fixtures,
});

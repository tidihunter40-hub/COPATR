import { publicPage } from './real-app.js';
import { generateFixtures, updateResult } from './engine.mjs';
import { DEMO_TEAMS } from './demo-teams.mjs';

const competitionId = '51111111-1111-4111-8111-111111111111';
const seasonId = '52222222-2222-4222-8222-222222222222';
const entries = DEMO_TEAMS.map((team) => ({
  id: team.id, season_id: seasonId, club_id: team.id,
  club_name_snapshot: team.name, crest_path_snapshot: team.demoAsset,
  status: 'confirmed',
}));
const schedule = generateFixtures(DEMO_TEAMS);
const confirmed = [[0, 2, 1], [1, 1, 1], [2, 0, 3]].reduce((list, [index, home, away]) => updateResult(list, schedule[index].id, home, away), schedule);
const matches = confirmed.map((fixture, index) => ({
  id: `54444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
  season_id: seasonId, phase: 'league', round_number: fixture.round,
  scheduled_at: `2026-10-${String(20 + fixture.round).padStart(2, '0')}T19:${index % 2 ? '30' : '00'}:00.000Z`,
  home_entry_id: fixture.homeId, away_entry_id: fixture.awayId,
  home_score: fixture.homeScore, away_score: fixture.awayScore,
  status: fixture.homeScore === null ? 'scheduled' : 'confirmed',
  updated_at: '2026-10-24T21:00:00.000Z',
}));
const records = {
  competitions: [{ id: competitionId, name: 'COPA TR DEMONSTRAÇÃO 2026', sport: 'Futebol', status: 'active', visibility: 'public' }],
  competition_seasons: [{ id: seasonId, competition_id: competitionId, label: '2026 · Temporada de exemplo', format: 'round_robin', status: 'active' }],
  competition_entries: entries,
  matches,
  competition_titles: [],
  penalty_shootouts: [],
};

// A vitrine demonstrativa lê apenas estes dados em memória. Não possui acesso ao Supabase.
const client = {
  from(table) {
    let rows = records[table] || [];
    const query = {
      select() { return query; },
      eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
      in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query; },
      order(key, options = {}) { rows = [...rows].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (options.ascending ? 1 : -1)); return query; },
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return query;
  },
  storage: { from() { return { createSignedUrl: async (path) => ({ data: { signedUrl: path }, error: null }) }; } },
};

publicPage(client, competitionId, true).catch(() => {
  document.querySelector('#real-app').textContent = 'Não foi possível abrir a demonstração agora.';
});

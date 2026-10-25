import { ESPORTS_DEMO } from './esports-demo.mjs';
import { demoDateForRound, getInteractiveFixtures } from './interactive-demo-state.mjs';
import { publicPage } from './real-app.js';

const competitionId = '11111111-1111-4111-8111-111111111111';
const seasonId = '22222222-2222-4222-8222-222222222222';
const entries = ESPORTS_DEMO.teams.map((team) => ({
  id: team.id, club_id: team.id,
  club_name_snapshot: team.name, crest_path_snapshot: team.demoAsset,
  status: 'confirmed',
}));
const matches = getInteractiveFixtures().map((fixture, index) => ({
  id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
  phase: 'league', round_number: fixture.round,
  scheduled_at: demoDateForRound(fixture.round).toISOString(),
  home_entry_id: fixture.homeId, away_entry_id: fixture.awayId,
  home_score: fixture.homeScore, away_score: fixture.awayScore,
  status: fixture.homeScore === null ? 'scheduled' : 'confirmed',
  updated_at: '2026-10-23T12:00:00.000Z',
}));
const records = {
  competitions: [{ id: competitionId, name: ESPORTS_DEMO.name, sport: ESPORTS_DEMO.sport, status: 'active', visibility: 'public' }],
  competition_seasons: [{ id: seasonId, label: '2026 · Demonstração', format: 'round_robin', status: 'active' }],
  competition_entries: entries,
  matches,
  competition_titles: [],
  penalty_shootouts: [],
};

// This adapter is in-memory. No official Supabase client, mutation or upload is used.
const client = {
  from(table) {
    let rows = records[table] || [];
    const query = {
      select() { return query; },
      eq(key, value) { rows = rows.filter((row) => key === 'season_id' || key === 'competition_id' ? true : row[key] === value); return query; },
      in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query; },
      order() { return query; },
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return query;
  },
  storage: { from() { return { createSignedUrl: async (path) => ({ data: { signedUrl: path }, error: null }) }; } },
};

publicPage(client, competitionId, true).catch((error) => {
  document.querySelector('#real-app').textContent = error?.message || 'Não foi possível carregar a demonstração.';
});

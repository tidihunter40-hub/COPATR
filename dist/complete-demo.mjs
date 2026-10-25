import { publicPage } from './real-app.js';

const competitionId = '51111111-1111-4111-8111-111111111111';
const seasonId = '52222222-2222-4222-8222-222222222222';
const teams = [
  ['fal', 'Falcões FC', 'A', 'falcon.svg'],
  ['com', 'Cometas AC', 'A', 'comet.svg'],
  ['cor', 'Coroa SC', 'A', 'crown.svg'],
  ['uni', 'União Atlético', 'A', 'union.svg'],
  ['tro', 'Trovão FC', 'B', 'thunder.svg'],
  ['mar', 'Maré Azul', 'B', 'tide.svg'],
  ['mon', 'Monte Esporte', 'B', 'summit.svg'],
  ['orb', 'Órbita FC', 'B', 'orbit.svg'],
];
const entries = teams.map(([code, name, group, asset]) => ({
  id: `demo-${code}`, season_id: seasonId, club_id: `demo-${code}`,
  club_name_snapshot: name, crest_path_snapshot: `/assets/demo-crests/${asset}`,
  group_label: group, status: 'confirmed',
}));
const fixtures = [
  ['groups', 1, 'fal', 'uni', 2, 0], ['groups', 1, 'com', 'cor', 1, 1],
  ['groups', 1, 'tro', 'orb', 2, 1], ['groups', 1, 'mar', 'mon', 0, 0],
  ['groups', 2, 'fal', 'cor', 1, 1], ['groups', 2, 'uni', 'com', 0, 2],
  ['groups', 2, 'tro', 'mon', 1, 0], ['groups', 2, 'orb', 'mar', 1, 2],
  ['groups', 3, 'fal', 'com', 3, 1], ['groups', 3, 'cor', 'uni', 2, 1],
  ['groups', 3, 'tro', 'mar', 2, 2], ['groups', 3, 'mon', 'orb', 3, 1],
  ['semifinal', 1, 'fal', 'mar', 2, 1], ['semifinal', 1, 'tro', 'cor', 1, 0],
  ['final', 1, 'fal', 'tro', null, null],
];
const matches = fixtures.map(([phase, round, home, away, homeScore, awayScore], index) => ({
  id: `54444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
  season_id: seasonId, phase, round_number: round,
  scheduled_at: `2026-10-${String(20 + (phase === 'groups' ? round : phase === 'semifinal' ? 4 : 8)).padStart(2, '0')}T19:${index % 2 ? '30' : '00'}:00.000Z`,
  home_entry_id: `demo-${home}`, away_entry_id: `demo-${away}`,
  home_score: homeScore, away_score: awayScore,
  status: homeScore === null ? 'scheduled' : 'confirmed',
  updated_at: '2026-10-24T21:00:00.000Z',
}));
const records = {
  competitions: [{ id: competitionId, name: 'COPA DEMONSTRAÇÃO TR', sport: 'Futebol', status: 'active', visibility: 'public' }],
  competition_seasons: [{ id: seasonId, competition_id: competitionId, label: '2026 · Temporada de exemplo', format: 'groups_knockout', status: 'active' }],
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

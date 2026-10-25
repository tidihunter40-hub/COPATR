export const normalizeCatalogText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export const phaseLabel = (phase) => ({
  league: 'Liga', groups: 'Fase de grupos', round_of_16: 'Oitavas de final', quarterfinal: 'Quartas de final', semifinal: 'Semifinais', third_place: 'Disputa de 3º lugar', final: 'Final',
}[phase] || '');

export function catalogStatus(competition, season) {
  const status = season?.status || competition?.status;
  if (status === 'active') return { id: 'active', label: 'Em andamento' };
  if (status === 'completed') return { id: 'completed', label: 'Finalizado' };
  if (status === 'archived') return { id: 'archived', label: 'Arquivado' };
  if (status === 'draft') return { id: 'draft', label: 'Em breve' };
  return { id: status || 'published', label: status || 'Publicado' };
}

function latestSeason(seasons) {
  return [...seasons].sort((a, b) => {
    const aActive = a.status === 'active' ? 1 : 0;
    const bActive = b.status === 'active' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  })[0] || null;
}

export function createCatalogItems({ competitions = [], seasons = [], entries = [], matches = [], champions = [] }) {
  const seasonsByCompetition = new Map();
  seasons.forEach((season) => {
    const items = seasonsByCompetition.get(season.competition_id) || [];
    items.push(season); seasonsByCompetition.set(season.competition_id, items);
  });
  const entriesBySeason = new Map();
  entries.forEach((entry) => {
    const items = entriesBySeason.get(entry.season_id) || [];
    items.push(entry); entriesBySeason.set(entry.season_id, items);
  });
  const matchesBySeason = new Map();
  matches.forEach((match) => {
    const items = matchesBySeason.get(match.season_id) || [];
    items.push(match); matchesBySeason.set(match.season_id, items);
  });
  const championsBySeason = new Map(champions.filter((title) => title.place === 1 && title.club?.official_name).map((title) => [title.season_id, title.club.official_name]));

  return competitions.map((competition) => {
    const season = latestSeason(seasonsByCompetition.get(competition.id) || []);
    const seasonEntries = season ? (entriesBySeason.get(season.id) || []) : [];
    const seasonMatches = season ? (matchesBySeason.get(season.id) || []) : [];
    const names = new Map(seasonEntries.map((entry) => [entry.id, entry.club_name_snapshot]));
    const confirmedEntries = seasonEntries.filter((entry) => entry.status === 'confirmed');
    const scheduled = seasonMatches.filter((match) => ['scheduled', 'in_progress'].includes(match.status) && match.scheduled_at).sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))[0];
    const confirmed = seasonMatches.filter((match) => match.status === 'confirmed' && match.home_score !== null && match.away_score !== null).sort((a, b) => String(b.updated_at || b.scheduled_at || '').localeCompare(String(a.updated_at || a.scheduled_at || '')))[0];
    const reference = scheduled || confirmed || seasonMatches.at(-1);
    return {
      ...competition,
      season,
      status: catalogStatus(competition, season),
      teamCount: confirmedEntries.length,
      match: reference ? { ...reference, home: names.get(reference.home_entry_id) || null, away: names.get(reference.away_entry_id) || null, kind: scheduled ? 'Próxima partida' : confirmed ? 'Último resultado' : 'Partida registrada' } : null,
      phase: reference?.phase ? phaseLabel(reference.phase) : '',
      champion: season ? championsBySeason.get(season.id) || null : null,
      sortDate: season?.starts_on || competition.updated_at || '',
    };
  });
}

export function filterCatalog(items, { search = '', status = 'all', sport = 'all', sort = 'recent' } = {}) {
  const needle = normalizeCatalogText(search);
  const filtered = items.filter((item) => (!needle || normalizeCatalogText(item.name).includes(needle)) && (status === 'all' || item.status.id === status) && (sport === 'all' || item.sport === sport));
  return [...filtered].sort((a, b) => {
    if (sort === 'active') return Number(b.status.id === 'active') - Number(a.status.id === 'active') || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    if (sort === 'final') return Number(b.status.id === 'completed') - Number(a.status.id === 'completed') || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    if (sort === 'start') return String(a.sortDate || '9999-12-31').localeCompare(String(b.sortDate || '9999-12-31'));
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
}

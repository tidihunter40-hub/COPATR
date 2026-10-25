import { supabaseConfig } from './runtime-config.mjs';

const configured = Boolean(supabaseConfig?.url && supabaseConfig?.anonKey);

async function readPublic(table, params) {
  const url = new URL(`/rest/v1/${table}`, supabaseConfig.url);
  url.search = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { apikey: supabaseConfig.anonKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Leitura pública indisponível (${response.status}).`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getPublicHomepageData() {
  if (!configured) return { competitions: [], seasons: [], entries: [], matches: [], champions: [], competitionsStatus: 'unconfigured', championsStatus: 'unconfigured' };
  const [competitions, champions] = await Promise.allSettled([
    readPublic('competitions', { select: 'id,name,sport,status,updated_at', visibility: 'eq.public', order: 'updated_at.desc', limit: '100' }),
    readPublic('competition_titles', { select: 'id,season_id,place,confirmed_at,club:clubs(id,official_name,crest_path),season:competition_seasons(id,label,competition:competitions(id,name,sport))', place: 'in.(1,2)', order: 'confirmed_at.desc', limit: '200' }),
  ]);
  const publicCompetitions = competitions.status === 'fulfilled' && Array.isArray(competitions.value) ? competitions.value : [];
  const competitionIds = publicCompetitions.map((competition) => competition.id).filter(Boolean);
  let seasons = [], entries = [], matches = [];
  if (competitionIds.length) {
    try {
      seasons = await readPublic('competition_seasons', {
        select: 'id,competition_id,label,format,status,starts_on,ends_on,created_at,updated_at',
        competition_id: `in.(${competitionIds.join(',')})`,
        order: 'created_at.desc',
        limit: '500',
      });
      const seasonIds = seasons.map((season) => season.id).filter(Boolean);
      if (seasonIds.length) {
        [entries, matches] = await Promise.all([
          readPublic('competition_entries', { select: 'id,season_id,club_name_snapshot,status', season_id: `in.(${seasonIds.join(',')})`, limit: '2000' }),
          readPublic('matches', { select: 'id,season_id,phase,round_number,scheduled_at,home_entry_id,away_entry_id,home_score,away_score,status,updated_at', season_id: `in.(${seasonIds.join(',')})`, order: 'scheduled_at.asc.nullslast,updated_at.desc', limit: '5000' }),
        ]);
      }
    } catch {
      // Metadata enriches the catalogue but must never hide public competitions if it is unavailable.
      seasons = []; entries = []; matches = [];
    }
  }
  return {
    competitions: publicCompetitions,
    seasons: Array.isArray(seasons) ? seasons : [],
    entries: Array.isArray(entries) ? entries : [],
    matches: Array.isArray(matches) ? matches : [],
    champions: champions.status === 'fulfilled' && Array.isArray(champions.value) ? champions.value.filter((title) => title.place === 1).map((title) => ({ ...title, runnerUp: champions.value.find((other) => other.season_id === title.season_id && other.place === 2)?.club || null })) : [],
    competitionsStatus: competitions.status === 'fulfilled' ? 'ready' : 'error',
    championsStatus: champions.status === 'fulfilled' ? 'ready' : 'error',
  };
}

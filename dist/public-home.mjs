import { supabaseConfig } from './runtime-config.mjs';

const configured = Boolean(supabaseConfig?.url && supabaseConfig?.anonKey);
const signedCrests = new Map();

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

export async function publicCrestUrl(path) {
  if (typeof path !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(?:original|processed)\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/i.test(path)) return null;
  const cached = signedCrests.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  try {
    const url = new URL(`/storage/v1/object/sign/competition-crests/${path}`, supabaseConfig.url);
    const response = await fetch(url, {
      method: 'POST',
      headers: { apikey: supabaseConfig.anonKey, Authorization: `Bearer ${supabaseConfig.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const signedUrl = data.signedURL ? new URL(data.signedURL, supabaseConfig.url).href : null;
    if (signedUrl) signedCrests.set(path, { url: signedUrl, until: Date.now() + 50 * 60_000 });
    return signedUrl;
  } catch { return null; }
}

async function readPublicCompetitions() {
  let rows;
  try { rows = await readPublic('competitions', { select: 'id,name,sport,status,updated_at,crest_path', visibility: 'eq.public', order: 'updated_at.desc', limit: '100' }); }
  catch { rows = await readPublic('competitions', { select: 'id,name,sport,status,updated_at', visibility: 'eq.public', order: 'updated_at.desc', limit: '100' }); }
  return rows;
}

export async function getPublicHomepageData(mode = 'full') {
  if (mode === 'none') return { competitions: [], seasons: [], entries: [], matches: [], champions: [], competitionsStatus: 'ready', championsStatus: 'ready' };
  if (!configured) return { competitions: [], seasons: [], entries: [], matches: [], champions: [], competitionsStatus: 'unconfigured', championsStatus: 'unconfigured' };
  const [competitions, champions] = await Promise.allSettled([
    readPublicCompetitions(),
    readPublic('competition_titles', { select: 'id,season_id,place,confirmed_at,club:clubs(id,official_name,crest_path),season:competition_seasons(id,label,competition:competitions(id,name,sport))', place: 'in.(1,2)', order: 'confirmed_at.desc', limit: '200' }),
  ]);
  const publicCompetitions = competitions.status === 'fulfilled' && Array.isArray(competitions.value) ? competitions.value : [];
  const publicChampions = champions.status === 'fulfilled' && Array.isArray(champions.value) ? champions.value.filter((title) => title.place === 1).map((title) => ({ ...title, runnerUp: champions.value.find((other) => other.season_id === title.season_id && other.place === 2)?.club || null })) : [];
  if (mode === 'summary') return { competitions: publicCompetitions, seasons: [], entries: [], matches: [], champions: publicChampions, competitionsStatus: competitions.status === 'fulfilled' ? 'ready' : 'error', championsStatus: champions.status === 'fulfilled' ? 'ready' : 'error' };
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
      const latest = new Map();
      for (const season of seasons) {
        const previous = latest.get(season.competition_id);
        if (!previous || (season.status === 'active' && previous.status !== 'active')) latest.set(season.competition_id, season);
      }
      seasons = [...latest.values()];
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
    champions: publicChampions,
    competitionsStatus: competitions.status === 'fulfilled' ? 'ready' : 'error',
    championsStatus: champions.status === 'fulfilled' ? 'ready' : 'error',
  };
}

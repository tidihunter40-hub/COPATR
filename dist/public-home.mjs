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
  if (!configured) return { competitions: [], champions: [], competitionsStatus: 'unconfigured', championsStatus: 'unconfigured' };
  const [competitions, champions] = await Promise.allSettled([
    readPublic('competitions', { select: 'id,name,sport,status', visibility: 'eq.public', order: 'updated_at.desc', limit: '6' }),
    readPublic('competition_titles', { select: 'id,season_id,place,confirmed_at,club:clubs(id,official_name,crest_path),season:competition_seasons(id,label,competition:competitions(id,name,sport))', place: 'in.(1,2)', order: 'confirmed_at.desc', limit: '200' }),
  ]);
  return {
    competitions: competitions.status === 'fulfilled' && Array.isArray(competitions.value) ? competitions.value : [],
    champions: champions.status === 'fulfilled' && Array.isArray(champions.value) ? champions.value.filter((title) => title.place === 1).map((title) => ({ ...title, runnerUp: champions.value.find((other) => other.season_id === title.season_id && other.place === 2)?.club || null })) : [],
    competitionsStatus: competitions.status === 'fulfilled' ? 'ready' : 'error',
    championsStatus: champions.status === 'fulfilled' ? 'ready' : 'error',
  };
}

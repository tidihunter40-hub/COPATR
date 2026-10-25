import { supabaseConfig } from './runtime-config.mjs';

const SESSION_KEY = 'tr-campeonatos-supabase-session-v1';

function configuration() {
  const config = globalThis.TR_CAMPEONATOS_SUPABASE_CONFIG || supabaseConfig || {};
  const url = typeof config.url === 'string' ? config.url.replace(/\/$/, '') : '';
  const anonKey = typeof config.anonKey === 'string' ? config.anonKey.trim() : '';
  try { if (url && anonKey) new URL(url); else return null; } catch { return null; }
  return { url, anonKey };
}

function readSession() {
  try {
    if (!globalThis.localStorage) return null;
    const session = JSON.parse(globalThis.localStorage.getItem(SESSION_KEY) || 'null');
    return session && typeof session.access_token === 'string' ? session : null;
  } catch { return null; }
}

function persistSession(session) {
  if (!globalThis.localStorage) return;
  if (session?.access_token) globalThis.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else globalThis.localStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}, authenticated = true) {
  const config = configuration();
  if (!config) throw new Error('Supabase ainda não foi configurado neste ambiente.');
  const session = authenticated ? readSession() : null;
  const headers = new Headers(options.headers || {});
  headers.set('apikey', config.anonKey);
  headers.set('Accept', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(`${config.url}${path}`, { ...options, headers });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) throw new Error(data?.message || data?.error_description || `Supabase respondeu ${response.status}.`);
  return data;
}

function query(table, params) {
  const search = new URLSearchParams(params);
  return `/rest/v1/${table}?${search}`;
}

export function getRealModeStatus() {
  const configured = Boolean(configuration());
  const signedIn = Boolean(readSession());
  return { configured, signedIn, mode: configured ? (signedIn ? 'real-ready' : 'auth-required') : 'not-configured' };
}

export function getCurrentSession() { return readSession(); }

export async function signInWithPassword(email, password) {
  const data = await request('/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  }, false);
  persistSession(data);
  return data;
}

export async function signOut() {
  try { await request('/auth/v1/logout', { method: 'POST' }); } finally { persistSession(null); }
}

export async function createPermanentClub(club) {
  const data = await request('/rest/v1/clubs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(club),
  });
  return data?.[0] || data;
}

export async function uploadClubCrest(clubId, file) {
  if (!(file instanceof File)) throw new Error('Selecione um arquivo de escudo válido.');
  const extension = String(file.name).split('.').pop()?.toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(extension)) throw new Error('Use PNG, JPG ou WEBP.');
  const path = `${clubId}/${crypto.randomUUID()}.${extension === 'jpeg' ? 'jpg' : extension}`;
  await request(`/storage/v1/object/club-crests/${path}`, { method: 'POST', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
  await request(`${query('clubs', { id: `eq.${clubId}` })}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ crest_path: path }),
  });
  return path;
}

export async function getSignedCrestUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const data = await request(`/storage/v1/object/sign/club-crests/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn }),
  });
  const config = configuration();
  return data?.signedURL ? `${config.url}/storage/v1${data.signedURL}` : null;
}

export async function getPublicClubHistory(clubId) {
  const [club, stats, titles, entries] = await Promise.allSettled([
    request(query('clubs', { select: 'id,slug,official_name,short_name,sport,primary_color,secondary_color,crest_path,status', id: `eq.${clubId}`, limit: '1' }), {}, false),
    request(query('club_lifetime_stats', { select: '*', club_id: `eq.${clubId}`, limit: '1' }), {}, false),
    request(query('competition_titles', { select: 'id,place,title_type,confirmed_at,season_id,season:competition_seasons(id,label,competition:competitions(name,sport))', club_id: `eq.${clubId}`, order: 'confirmed_at.desc' }), {}, false),
    request(query('competition_entries', { select: 'id,club_id,season_id,registered_at,final_position,final_phase,status,season:competition_seasons(id,label,category,format,competition:competitions(name,sport,visibility))', club_id: `eq.${clubId}`, order: 'registered_at.desc' }), {}, false),
  ]);
  if (club.status === 'rejected') throw club.reason;
  return {
    club: club.value?.[0] || null,
    stats: stats.status === 'fulfilled' ? stats.value?.[0] || null : null,
    statsStatus: stats.status === 'fulfilled' ? 'ready' : 'unavailable',
    titles: titles.status === 'fulfilled' ? titles.value || [] : [],
    titlesStatus: titles.status === 'fulfilled' ? 'ready' : 'unavailable',
    entries: entries.status === 'fulfilled' ? entries.value || [] : [],
    entriesStatus: entries.status === 'fulfilled' ? 'ready' : 'unavailable',
  };
}

export async function getPublicSeasonJourney(seasonId) {
  const [entries, matches] = await Promise.all([
    request(query('competition_entries', { select: 'id,club_id,club_name_snapshot,crest_path_snapshot,status', season_id: `eq.${seasonId}`, order: 'registered_at.asc' }), {}, false),
    request(query('matches', { select: 'id,phase,round_number,leg_number,home_entry_id,away_entry_id,home_score,away_score,status,scheduled_at', season_id: `eq.${seasonId}`, order: 'round_number.asc,leg_number.asc' }), {}, false),
  ]);
  const ids = matches.map((match) => match.id);
  let penalties = [];
  if (ids.length) {
    try { penalties = await request(query('penalty_shootouts', { select: 'match_id,home_score,away_score,winning_entry_id', match_id: `in.(${ids.join(',')})` }), {}, false); }
    catch { /* The round-by-round journey remains available without shootout detail. */ }
  }
  const crestUrls = await Promise.all(entries.map(async (entry) => {
    try { return [entry.id, entry.crest_path_snapshot ? await getSignedCrestUrl(entry.crest_path_snapshot) : null]; }
    catch { return [entry.id, null]; }
  }));
  return { entries, matches, penalties, crestUrls: Object.fromEntries(crestUrls) };
}

export async function recordOfficialResult(matchId, homeScore, awayScore, status = 'confirmed') {
  return request('/rest/v1/rpc/set_match_result', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_match: matchId, target_home_score: homeScore, target_away_score: awayScore, target_status: status }),
  });
}

export async function confirmOfficialTitle(seasonId, entryId, place) {
  return request('/rest/v1/rpc/confirm_competition_title', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_season: seasonId, target_entry: entryId, target_place: place }),
  });
}

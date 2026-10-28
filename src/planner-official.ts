import { createClient } from '@supabase/supabase-js';

type Config = { url?: string; anonKey?: string };

export async function loadOfficialPlannerEntries(seasonId: string, config: Config) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonId)) throw new Error('Temporada inválida.');
  if (!config.url || !config.anonKey) throw new Error('O ambiente oficial não está configurado.');
  const client = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Entre no painel para usar as equipes cadastradas nesta temporada.');
  const seasonResult = await client.from('competition_seasons').select('*').eq('id', seasonId).maybeSingle();
  if (seasonResult.error || !seasonResult.data) throw new Error('Temporada indisponível para esta conta.');
  const season = seasonResult.data;
  const [competitionResult, entryResult] = await Promise.all([
    client.from('competitions').select('id,name,sport,status,setup_mode').eq('id', season.competition_id).maybeSingle(),
    client.from('competition_entries').select('id,club_id,club_name_snapshot,crest_path_snapshot,status').eq('season_id', seasonId).eq('status', 'confirmed').order('registered_at'),
  ]);
  if (entryResult.error) throw new Error('Não foi possível consultar as equipes desta temporada.');
  let competition = competitionResult.data;
  if (competitionResult.error && ['42703', 'PGRST204'].includes(competitionResult.error.code || '')) {
    const legacy = await client.from('competitions').select('id,name,sport,status').eq('id', season.competition_id).maybeSingle();
    if (!legacy.error && legacy.data) competition = { ...legacy.data, setup_mode: 'standard' };
  }
  if (!competition) throw new Error('Não foi possível consultar o campeonato desta temporada.');
  const entries = entryResult.data || [];
  const clubIds = [...new Set(entries.map((entry) => entry.club_id).filter(Boolean))];
  if (clubIds.length) {
    const clubs = await client.from('clubs').select('id,crest_path').in('id', clubIds);
    if (!clubs.error) {
      const current = new Map((clubs.data || []).map((club) => [club.id, club.crest_path]));
      entries.forEach((entry) => { if (current.has(entry.club_id)) entry.crest_path_snapshot = current.get(entry.club_id) || null; });
    }
  }
  const paths = [...new Set(entries.map((entry) => entry.crest_path_snapshot).filter((path): path is string => Boolean(path)))];
  const signed = new Map<string, string>();
  await Promise.all(paths.map(async (path) => {
    const { data, error } = await client.storage.from('club-crests').createSignedUrl(path, 3600);
    if (!error && data?.signedUrl) signed.set(path, data.signedUrl);
  }));
  const matchResult = await client.from('matches').select('id', { count: 'exact', head: true }).eq('season_id', seasonId);
  if (matchResult.error) throw new Error('Não foi possível verificar os confrontos existentes.');
  return {
    season,
    competition,
    existingMatchCount: matchResult.count || 0,
    teams: entries.map((entry) => ({ id: entry.id, name: entry.club_name_snapshot, crest: entry.crest_path_snapshot ? signed.get(entry.crest_path_snapshot) || null : null })),
  };
}

export async function confirmOfficialDraw(seasonId: string, kind: string, groups: Array<{ name: string; entryIds: string[] }>, fixtures: Array<{ homeId: string; awayId: string; round: number; leg: number; phase: string; scheduledAt?: string | null }>, config: Config) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonId)) throw new Error('Temporada inválida.');
  if (!config.url || !config.anonKey) throw new Error('O ambiente oficial não está configurado.');
  const client = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Entre no painel para confirmar o sorteio.');
  const result = await client.rpc('confirm_competition_draw', {
    target_season: seasonId, target_kind: kind, target_groups: groups, target_fixtures: fixtures,
  });
  if (result.error) throw new Error(result.error.code === 'PGRST202'
    ? 'A confirmação oficial requer a migração 202610250007 no Supabase.' : result.error.message);
  return Number(result.data);
}

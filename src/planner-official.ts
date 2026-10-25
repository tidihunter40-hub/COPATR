import { createClient } from '@supabase/supabase-js';

type Config = { url?: string; anonKey?: string };

export async function loadOfficialPlannerEntries(seasonId: string, config: Config) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonId)) throw new Error('Temporada inválida.');
  if (!config.url || !config.anonKey) throw new Error('O ambiente oficial não está configurado.');
  const client = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Entre no painel para usar as equipes cadastradas nesta temporada.');
  const seasonResult = await client.from('competition_seasons').select('id,label,format,competition_id').eq('id', seasonId).maybeSingle();
  if (seasonResult.error || !seasonResult.data) throw new Error('Temporada indisponível para esta conta.');
  const season = seasonResult.data;
  const [competitionResult, entryResult] = await Promise.all([
    client.from('competitions').select('id,name,sport').eq('id', season.competition_id).maybeSingle(),
    client.from('competition_entries').select('id,club_name_snapshot,crest_path_snapshot,status').eq('season_id', seasonId).eq('status', 'confirmed').order('registered_at'),
  ]);
  if (competitionResult.error || !competitionResult.data || entryResult.error) throw new Error('Não foi possível consultar as equipes desta temporada.');
  const entries = entryResult.data || [];
  const paths = [...new Set(entries.map((entry) => entry.crest_path_snapshot).filter((path): path is string => Boolean(path)))];
  const signed = new Map<string, string>();
  await Promise.all(paths.map(async (path) => {
    const { data, error } = await client.storage.from('club-crests').createSignedUrl(path, 3600);
    if (!error && data?.signedUrl) signed.set(path, data.signedUrl);
  }));
  return {
    season,
    competition: competitionResult.data,
    teams: entries.map((entry) => ({ id: entry.id, name: entry.club_name_snapshot, crest: entry.crest_path_snapshot ? signed.get(entry.crest_path_snapshot) || null : null })),
  };
}

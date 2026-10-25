import { readFile } from 'node:fs/promises';

const contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '');
const env = Object.fromEntries(contents.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
  const separator = line.indexOf('=');
  return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
}));
const url = process.env.TR_SUPABASE_URL || env.TR_SUPABASE_URL;
const key = process.env.TR_SUPABASE_ANON_KEY || env.TR_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.log('Supabase: configuração ausente.');
  process.exit(0);
}
try { new URL(url); } catch { console.log('Supabase: URL configurada inválida.'); process.exit(0); }

const checks = [
  ['auth', '/auth/v1/settings'],
  ['competitions', '/rest/v1/competitions?select=id&limit=1'],
  ['competition_seasons', '/rest/v1/competition_seasons?select=id&limit=1'],
  ['matches', '/rest/v1/matches?select=id&limit=1'],
  ['profiles_authorization', '/rest/v1/profiles?select=account_role,organizer_status&limit=1'],
  ['club_lifetime_stats', '/rest/v1/club_lifetime_stats?select=club_id&limit=1'],
];
for (const [name, path] of checks) {
  try {
    const response = await fetch(new URL(path, url), { headers: { apikey: key }, signal: AbortSignal.timeout(6000) });
    console.log(`${name}: HTTP ${response.status}`);
  } catch (error) {
    console.log(`${name}: indisponível (${error.cause?.code || error.name || 'erro de rede'})`);
  }
}

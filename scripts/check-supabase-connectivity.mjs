import { readFile } from 'node:fs/promises';

const lines = (await readFile('.env.local', 'utf8')).split(/\r?\n/);
const settings = Object.fromEntries(lines.map(line => {
  const index = line.indexOf('=');
  return index < 0 ? [] : [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}).filter(pair => pair.length === 2));
const base = settings.TR_SUPABASE_URL;
const key = settings.TR_SUPABASE_ANON_KEY;
if (!base || !key) {
  console.log('Supabase: configuração ausente.');
  process.exit(0);
}
try {
  const target = new URL('/rest/v1/competitions?select=id&limit=1', base);
  const response = await fetch(target, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
  console.log(`Supabase: HTTP ${response.status}; nenhuma gravação executada.`);
} catch (error) {
  console.log(`Supabase: sem conexão (${error.cause?.code || error.name || 'erro'}).`);
}

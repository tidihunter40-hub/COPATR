import { readFile } from 'node:fs/promises';

const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const url = process.env.TR_SUPABASE_URL || env.TR_SUPABASE_URL;
const anonKey = process.env.TR_SUPABASE_ANON_KEY || env.TR_SUPABASE_ANON_KEY;
if (!url || !anonKey) { console.log('Backend público: configuração indisponível.'); process.exit(2); }

try {
  const endpoint = new URL('/rest/v1/competitions?select=id&visibility=eq.public&limit=100', url);
  const response = await fetch(endpoint, { headers: { apikey: anonKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) { console.log(`Backend público: HTTP ${response.status}.`); process.exit(1); }
  const records = await response.json();
  if (!Array.isArray(records)) { console.log('Backend público: resposta inesperada.'); process.exit(1); }
  console.log(`Backend público: consulta anônima OK; ${records.length} campeonato(s) publicado(s) retornado(s).`);
} catch (error) {
  console.log(`Backend público: consulta indisponível (${error?.name || 'erro de rede'}${error?.cause?.code ? `, ${error.cause.code}` : ''}).`);
  process.exit(1);
}

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const escapeMeta = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const uuid = /^[0-9a-f-]{36}$/i;

export async function GET(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || url.pathname.split('/').filter(Boolean).at(-1);
  if (!uuid.test(id || '')) return new Response('Not found', { status: 404 });
  let html = await readFile(resolve(process.cwd(), 'dist/competition.html'), 'utf8');
  const endpoint = process.env.TR_SUPABASE_URL;
  const key = process.env.TR_SUPABASE_ANON_KEY;
  if (endpoint && key) {
    try {
      const query = new URL('/rest/v1/competitions', endpoint);
      query.searchParams.set('select', 'name,sport');
      query.searchParams.set('id', `eq.${id}`);
      query.searchParams.set('visibility', 'eq.public');
      query.searchParams.set('limit', '1');
      const response = await fetch(query, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const [competition] = await response.json();
        if (competition) {
          const title = escapeMeta(`${competition.name} | TR Campeonatos`);
          const description = escapeMeta(`Acompanhe partidas, resultados e classificação de ${competition.name} (${competition.sport}) na TR Campeonatos.`);
          html = html.replace('<title>Campeonato | TR Campeonatos</title>', `<title>${title}</title>`)
            .replace('content="Campeonato | TR Campeonatos"', `content="${title}"`)
            .replace('content="Acompanhe partidas, resultados e classificação."', `content="${description}"`);
          const origin = process.env.TR_PUBLIC_BASE_URL || url.origin;
          const publicUrl = escapeMeta(`${origin}/c/${id}`);
          const imageUrl = escapeMeta(`${origin}/assets/official/01_logo_principal_transparente.png`);
          html = html.replace('</head>', `<meta property="og:url" content="${publicUrl}"><meta property="og:image" content="${imageUrl}"><link rel="canonical" href="${publicUrl}"></head>`);
        }
      }
    } catch { /* Sem metadados remotos, a página pública continua utilizável. */ }
  }
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin' },
  });
}

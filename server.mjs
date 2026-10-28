import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';

const root = resolve('dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.jpe': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const port = Number(process.env.PORT || 45321);
const envFile = resolve('.env.local');

async function localEnv() {
  try {
    const contents = await readFile(envFile, 'utf8');
    return Object.fromEntries(contents.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
      const index = line.indexOf('=');
      return index < 0 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)];
    }));
  } catch { return {}; }
}

const runtimeEnv = await localEnv();
const compressedStatic = new Map();
const appRoutes = new Set(['/', '/funcionalidades', '/como-funciona', '/campeonatos', '/laboratorio', '/planos', '/contato', '/entrar']);
const escapeMeta = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

async function competitionMetadata(id, request) {
  const url = process.env.TR_SUPABASE_URL || runtimeEnv.TR_SUPABASE_URL;
  const key = process.env.TR_SUPABASE_ANON_KEY || runtimeEnv.TR_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const endpoint = new URL('/rest/v1/competitions', url);
    endpoint.searchParams.set('select', 'name,sport');
    endpoint.searchParams.set('id', `eq.${id}`);
    endpoint.searchParams.set('visibility', 'eq.public');
    endpoint.searchParams.set('limit', '1');
    const result = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2500) });
    if (!result.ok) return null;
    const [competition] = await result.json();
    if (!competition) return null;
    const configuredOrigin = process.env.TR_PUBLIC_BASE_URL || runtimeEnv.TR_PUBLIC_BASE_URL;
    const host = request.headers.host;
    const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const origin = configuredOrigin || (typeof host === 'string' && /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? `${protocol}://${host}` : '');
    return { ...competition, origin };
  } catch { return null; }
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url, 'http://localhost');
  const pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/entrar') {
    const sensitive = [...requestUrl.searchParams.keys()].some((key) => /^(?:email|e-mail|password|senha|passwd)$/i.test(key));
    if (sensitive) {
      const requestedReturn = requestUrl.searchParams.get('retorno');
      const safeReturn = requestedReturn && (/^\/painel(?:\/|$)/.test(requestedReturn) || requestedReturn === '/minha-conta') ? `?retorno=${encodeURIComponent(requestedReturn)}` : '';
      response.writeHead(303, { Location: `/entrar${safeReturn}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).end();
      return;
    }
  }
  if (['/dashboard', '/organizador', '/admin'].includes(pathname)) {
    response.writeHead(302, { Location: '/painel' });
    response.end();
    return;
  }
  if (pathname === '/runtime-config.mjs') {
    const config = { url: process.env.TR_SUPABASE_URL || runtimeEnv.TR_SUPABASE_URL || '', anonKey: process.env.TR_SUPABASE_ANON_KEY || runtimeEnv.TR_SUPABASE_ANON_KEY || '' };
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(`export const supabaseConfig = Object.freeze(${JSON.stringify(config)});`);
    return;
  }
  const route = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const panelRoute = route === '/painel' || route.startsWith('/painel/');
  const publicRoute = /^\/c\/[0-9a-f-]{36}$/i.test(route);
  const clubRoute = /^\/clubes\/[0-9a-f-]{36}$/i.test(route);
  const demoCompetitionRoute = route === '/demonstracao/copa-tr-esports';
  const completeDemoRoute = route === '/demonstracao/copa-exemplo';
  const pageFile = route === '/demonstracao' ? 'interactive-demo.html' : route === '/planejador' ? 'competition-planner.html' : route === '/minha-conta' ? 'account.html' : route === '/campeonatos' ? 'catalog.html' : route === '/como-funciona' ? 'how.html' : appRoutes.has(route) ? route === '/' ? 'index.html' : 'site-all.html' : panelRoute ? 'panel.html' : publicRoute ? 'competition.html' : clubRoute ? 'club.html' : demoCompetitionRoute ? 'demo-competition.html' : completeDemoRoute ? 'complete-demo.html' : pathname.slice(1);
  const target = resolve(join(root, pageFile));
  if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const file = await stat(target);
    if (!file.isFile()) throw new Error('Not a file');
    let contents = await readFile(target);
    if (publicRoute) {
      const metadata = await competitionMetadata(route.slice(3), request);
      if (metadata) {
        const title = escapeMeta(`${metadata.name} | TR Campeonatos`);
        const description = escapeMeta(`Acompanhe partidas, resultados e classificação de ${metadata.name} (${metadata.sport}) na TR Campeonatos.`);
        let html = contents.toString('utf8')
          .replace('<title>Campeonato | TR Campeonatos</title>', `<title>${title}</title>`)
          .replace('content="Campeonato | TR Campeonatos"', `content="${title}"`)
          .replace('content="Acompanhe partidas, resultados e classificação."', `content="${description}"`);
        if (metadata.origin) {
          const publicUrl = escapeMeta(`${metadata.origin}/c/${route.slice(3)}`);
          const imageUrl = escapeMeta(`${metadata.origin}/assets/official/01_logo_principal_transparente.png`);
          html = html.replace('</head>', `<meta property="og:url" content="${publicUrl}"><meta property="og:image" content="${imageUrl}"><link rel="canonical" href="${publicUrl}"></head>`);
        }
        contents = Buffer.from(html);
      }
    }
    const extension = extname(target);
    const mime = types[extension] || 'application/octet-stream';
    const staticAsset = route.startsWith('/assets/');
    const staticCode = ['.css', '.js', '.mjs'].includes(extension) && route !== '/sw.js';
    const cacheControl = staticAsset ? 'public, max-age=86400, stale-while-revalidate=86400'
      : staticCode ? 'public, max-age=3600, stale-while-revalidate=86400' : 'no-store';
    const textResource = /^(?:text\/|application\/(?:json|manifest))/i.test(mime);
    const headers = { 'Content-Type': textResource ? `${mime}; charset=utf-8` : mime, 'Cache-Control': cacheControl, 'Referrer-Policy': route === '/entrar' ? 'no-referrer' : 'strict-origin-when-cross-origin' };
    if (textResource && contents.length > 1024 && /\bbr\b/.test(request.headers['accept-encoding'] || '')) {
      const key = `${target}:${file.mtimeMs}:${file.size}`;
      if (staticAsset || staticCode) {
        if (!compressedStatic.has(key)) compressedStatic.set(key, brotliCompressSync(contents, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }));
        contents = compressedStatic.get(key);
      } else contents = brotliCompressSync(contents, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } });
      headers['Content-Encoding'] = 'br';
      headers.Vary = 'Accept-Encoding';
    }
    response.writeHead(200, headers);
    response.end(contents);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`TR Campeonatos: http://127.0.0.1:${port}`));

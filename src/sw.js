const CACHE = 'tr-campeonatos-public-v66';
const APP_SHELL = ['/index.html', '/pwa-register.mjs'];
const OFFLINE = () => new Response('Esta página requer conexão. Tente novamente quando estiver online.', {
  status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});

self.addEventListener('install', (event) => {
  // Images and route-specific code enter the cache only when requested.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key.startsWith('tr-campeonatos-')).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

const publicAsset = (path) => path.startsWith('/assets/') || /\.(?:css|js|mjs|svg|webp|avif|png|jpe?g|woff2?)$/i.test(path);
const imageAsset = (path) => /\.(?:svg|webp|avif|png|jpe?g)$/i.test(path);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && url.pathname === '/entrar' && [...url.searchParams.keys()].some((key) => /^(?:email|e-mail|password|senha|passwd)$/i.test(key))) {
    event.respondWith(Response.redirect('/entrar', 303));
    return;
  }
  if (url.pathname === '/runtime-config.mjs') {
    event.respondWith(fetch(request).catch(() => new Response("export const supabaseConfig = Object.freeze({ url: '', anonKey: '' });", {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
    })));
    return;
  }
  if (request.mode === 'navigate') {
    const dynamic = url.pathname === '/entrar' || url.pathname === '/campeonatos' || url.pathname.startsWith('/painel')
      || url.pathname === '/minha-conta' || url.pathname.startsWith('/c/') || url.pathname.startsWith('/clubes/');
    if (dynamic) { event.respondWith(fetch(request).catch(OFFLINE)); return; }
    const fallback = url.pathname === '/demonstracao/copa-tr-esports' ? '/demo-competition.html'
      : url.pathname === '/demonstracao/copa-exemplo' ? '/complete-demo.html'
      : url.pathname === '/demonstracao' ? '/interactive-demo.html'
      : url.pathname === '/' ? '/index.html'
      : url.pathname === '/como-funciona' ? '/how.html'
      : ['/funcionalidades', '/planos', '/laboratorio', '/contato'].includes(url.pathname) ? '/site-all.html' : null;
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && fallback) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(fallback, copy)));
      }
      return response;
    }).catch(async () => fallback ? (await caches.match(fallback)) || OFFLINE() : OFFLINE()));
    return;
  }
  if (url.search || !publicAsset(url.pathname)) return;
  if (imageAsset(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(OFFLINE)));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || OFFLINE()));
});

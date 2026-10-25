const CACHE = 'tr-campeonatos-public-v51';
const SHELL = ['/', '/index.html', '/styles.css', '/homepage-premium.css', '/showcase.css', '/identity-premium.css', '/lab-premium.css', '/club-profile.css', '/classification-reference.css', '/system-pages.css', '/landing-v2.css', '/refinement.css', '/dashboard-premium.css', '/dashboard-stage03.css', '/dashboard-stage031.css', '/dashboard-stage032.css', '/dashboard-stage033.css', '/club-stage04.css', '/gallery-stage05.css', '/visual-stage06.css', '/route-pages.css', '/home-stage02.css', '/route-pages.mjs', '/real-app.css', '/real-app.js', '/real-bootstrap.mjs', '/panel.html', '/competition.html', '/demo-competition.html', '/demo-competition.mjs', '/showcase.js', '/app.mjs', '/engine.mjs', '/club.mjs', '/demo-crests.mjs', '/esports-demo.mjs', '/supabase-real-mode.mjs', '/classification-ui.mjs', '/system-pages.mjs', '/landing.mjs', '/gallery-stage05.mjs', '/public-home.mjs', '/home-panel.mjs', '/manifest.webmanifest', '/assets/stadium-night.webp', '/assets/gallery-silver-trophy.webp', '/assets/competition-football.webp', '/assets/competition-futsal.webp', '/assets/home/football.webp', '/assets/home/futsal.webp', '/assets/home/volleyball.webp', '/assets/home/basketball.webp', '/assets/home/esports.webp', '/assets/home/functionality-card-reference.webp', '/assets/home/championship-card-reference.webp', '/assets/home/demo-card-reference.webp', '/assets/demo-crests/falcon.svg', '/assets/demo-crests/comet.svg', '/assets/demo-crests/crown.svg', '/assets/demo-crests/union.svg', '/assets/demo-crests/thunder.svg', '/assets/demo-crests/tide.svg', '/assets/demo-crests/summit.svg', '/assets/demo-crests/orbit.svg', '/assets/demo-esports/quack.jpeg', '/assets/demo-esports/galatasarrafo.jpe', '/assets/demo-esports/vibe.jpeg', '/assets/demo-esports/facao.jpeg', '/assets/demo-esports/underdogs.webp', '/assets/demo-esports/maquina.png', '/assets/official/01_logo_principal_transparente.png', '/assets/official/02_simbolo_sem_bola_transparente.png', '/assets/official/03_icone_app_transparente.png', '/assets/official/04_logo_monocromatica_transparente.png'];

SHELL.push('/club.html', '/public-arena.css', '/standings-premium.css', '/team-shield.css', '/team-management.css', '/smart-shield.mjs', '/demo-teams.mjs', '/interactive-demo.html', '/interactive-demo.css', '/interactive-demo.mjs', '/interactive-demo-state.mjs', '/assets/demo-teams/01_Bonoco_City.png', '/assets/demo-teams/02_Resenha_Clube.png', '/assets/demo-teams/03_Irmandade_ES.png', '/assets/demo-teams/04_Aguia_ES.png', '/assets/demo-teams/05_Os_Superstais.png', '/assets/demo-teams/06_Garotos_de_Pombal.png');
SHELL.push('/account.html', '/account.css', '/auth-header.css', '/auth-header.js', '/auth-header-bootstrap.mjs');
SHELL.push('/public-showcase.css', '/complete-demo.html', '/complete-demo.mjs');
const PRIVATE_SHELL = new Set(['/panel.html', '/competition.html', '/club.html', '/account.html', '/real-bootstrap.mjs', '/supabase-real-mode.mjs']);
const PUBLIC_SHELL = SHELL.filter((path) => !PRIVATE_SHELL.has(path));
PUBLIC_SHELL.push('/pwa-register.mjs', '/assets/official/03_icone_app_192.png', '/assets/official/03_icone_app_maskable_192.png', '/assets/official/03_icone_app_maskable_512.png');
const PUBLIC_ASSETS = new Set(PUBLIC_SHELL.filter((path) => path !== '/' && !path.endsWith('.html')));
const offline = () => new Response('Esta página requer conexão. Tente novamente quando estiver online.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key.startsWith('tr-campeonatos-')).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.pathname === '/entrar' && [...url.searchParams.keys()].some((key) => /^(?:email|e-mail|password|senha|passwd)$/i.test(key))) {
    event.respondWith(Response.redirect('/entrar', 303));
    return;
  }
  if (url.pathname === '/runtime-config.mjs') {
    event.respondWith(fetch(request).catch(() => new Response("export const supabaseConfig = Object.freeze({ url: '', anonKey: '' });", { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } })));
    return;
  }
  if (request.mode === 'navigate') {
    if (url.pathname === '/entrar' || url.pathname === '/campeonatos' || url.pathname.startsWith('/painel') || url.pathname === '/minha-conta' || url.pathname.startsWith('/c/') || url.pathname.startsWith('/clubes/')) {
      event.respondWith(fetch(request).catch(offline));
      return;
    }
    if (new URL(request.url).pathname === '/demonstracao/copa-tr-esports') {
      event.respondWith(fetch(request).catch(() => caches.match('/demo-competition.html')));
      return;
    }
    if (new URL(request.url).pathname === '/demonstracao/copa-exemplo') {
      event.respondWith(fetch(request).catch(() => caches.match('/complete-demo.html')));
      return;
    }
    if (new URL(request.url).pathname === '/demonstracao') {
      event.respondWith(fetch(request).catch(() => caches.match('/interactive-demo.html')));
      return;
    }
    if (['/', '/funcionalidades', '/como-funciona', '/planos', '/laboratorio'].includes(url.pathname)) event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    else event.respondWith(fetch(request).catch(offline));
    return;
  }
  if (!PUBLIC_ASSETS.has(url.pathname) || url.search) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)));
    }
    return response;
  }).catch(() => caches.match(url.pathname).then((cached) => cached || offline())));
});

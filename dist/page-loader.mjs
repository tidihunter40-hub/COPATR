const page = document.documentElement.dataset.page;

if (page === 'inicio' || page === 'funcionalidades' || page === 'demonstracao') await import('./app.mjs');
if (page === 'funcionalidades' || page === 'demonstracao') {
  await import('./classification-ui.mjs');
  await import('./system-pages.mjs');
}

if (page === 'inicio') {
  await import('./home-panel.mjs');
  await import('./landing.mjs');
} else if (page === 'campeonatos') {
  await import('./championships-catalog.mjs');
  await import('./landing.mjs');
} else if (page === 'como-funciona') {
  await import('./how-it-works.mjs');
} else if (page === 'funcionalidades' || page === 'demonstracao') {
  await import('./showcase.js');
  await import('./landing.mjs');
}

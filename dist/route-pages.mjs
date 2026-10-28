const pages = {
  inicio: ['Início', 'TR Campeonatos — Sua competição. Nossa tecnologia.', ''],
  funcionalidades: ['A PLATAFORMA', 'Funcionalidades', 'Ferramentas para organizar, acompanhar e apresentar suas competições.'],
  'como-funciona': ['DO INÍCIO AO APITO FINAL', 'Como funciona', 'Conheça o fluxo de criação, gestão e acompanhamento de um campeonato.'],
  campeonatos: ['VITRINE PÚBLICA', 'Campeonatos', 'Competições publicadas, resultados e conquistas confirmadas.'],
  demonstracao: ['LABORATÓRIO INTERATIVO', 'Demonstração', 'Experimente uma competição fictícia neste navegador, sem alterar dados oficiais.'],
  planos: ['PLANOS E ASSINATURAS', 'Planos', 'Conheça o estágio atual dos planos da TR Campeonatos.'],
  contato: ['FALE COM A GENTE', 'Contato', 'Converse com a equipe da TR Campeonatos sobre sua competição.'],
  entrar: ['ACESSO DO ORGANIZADOR', 'Entrar', 'Acesse as competições vinculadas à sua conta.'],
};
const page = document.documentElement.dataset.page;
const [label, title, description] = pages[page] || pages.inicio;
document.title = page === 'inicio' ? title : `${title} | TR Campeonatos`;
document.querySelector('#route-label').textContent = label;
document.querySelector('#route-heading').textContent = title;
document.querySelector('#route-description').textContent = description;
document.querySelectorAll('[data-route]').forEach((link) => {
  const active = link.dataset.route === page;
  link.classList.toggle('nav-active', active);
  if (active) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
});

// Keep established deep links from the interactive demo working across the new URLs.
const destinations = {
  inicio: '/', funcionalidades: '/funcionalidades', modalidades: '/funcionalidades', historia: '/funcionalidades',
  'como-funciona': '/como-funciona', campeonatos: '/campeonatos', galeria: '/campeonatos',
  planos: '/planos', demonstracao: '/demonstracao', 'previa-sistema': '/demonstracao', plataforma: '/demonstracao',
  classificacao: '/demonstracao', contato: '/contato',
};
const redirectLegacyHomeHash = () => {
  if (page !== 'inicio' || !location.hash) return;
  const id = decodeURIComponent(location.hash.slice(1));
  const destination = destinations[id];
  if (destination && destination !== '/') location.replace(`${destination}${id === 'contato' || id === 'galeria' ? '' : location.hash}`);
};
redirectLegacyHomeHash();
window.addEventListener('hashchange', redirectLegacyHomeHash);
document.addEventListener('click', (event) => {
  const anchor = event.target.closest?.('a[href^="#"]');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const hash = anchor.getAttribute('href');
  if (!hash || hash === '#') return;
  const id = decodeURIComponent(hash.slice(1));
  const destination = id.startsWith('clube-') ? '/demonstracao' : destinations[id];
  if (!destination) return;
  const current = location.pathname.replace(/\/$/, '') || '/';
  if (current === destination) return;
  event.preventDefault();
  location.assign(`${destination}${id === 'contato' || id === 'galeria' ? '' : hash}`);
}, true);

if (page === 'entrar') {
  await import('./real-bootstrap.mjs');
}

if (page === 'demonstracao') {
  const banner = document.querySelector('#route-banner');
  if (banner) {
    const link = document.createElement('a');
    link.className = 'button button-primary';
    link.href = '/demonstracao/copa-tr-esports';
    link.textContent = 'Explorar Copa TR Demonstração 2026 →';
    link.style.marginTop = '18px';
    banner.append(link);
  }
}

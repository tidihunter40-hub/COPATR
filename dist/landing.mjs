import { getPublicHomepageData, publicCrestUrl } from './public-home.mjs';
import { renderChampionGallery } from './gallery-stage05.mjs';

const hydratePublicCrest = async (image) => {
  const url = await publicCrestUrl(image.dataset.crestPath);
  if (url && image.isConnected) image.src = url;
};
const publicCrestObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    publicCrestObserver.unobserve(entry.target);
    hydratePublicCrest(entry.target);
  }
}, { rootMargin: '300px' }) : null;

const iconPaths = {
  ball: '<circle cx="16" cy="16" r="12"/><path d="m12 10 4-3 4 3-1.5 5h-5L12 10Z M13.5 15 9 19l2 5 M18.5 15l4.5 4-2 5 M11 24l5 3 5-3 M7 10h5 M20 10h5"/>',
  basket: '<circle cx="16" cy="16" r="12"/><path d="M4 16h24 M16 4v24 M7 8c5 3 7 7 7 12 M25 8c-5 3-7 7-7 12 M7 24c5-3 7-7 7-12 M25 24c-5-3-7-7-7-12"/>',
  volley: '<circle cx="16" cy="16" r="12"/><path d="M7 8c7 0 12 3 15 9 M12 5c-2 6-1 11 2 16 M25 8c-5 2-8 6-9 12 M7 24c5-2 9-2 15 0"/>',
  gamepad: '<path d="M9 11h14c3 0 5 2 6 6l1 6c.5 3-3 5-5 3l-4-4H11l-4 4c-2 2-5.5 0-5-3l1-6c1-4 3-6 6-6Z M9 17h7 M12.5 13.5v7 M22 16h.1 M25 19h.1"/>',
  plus: '<path d="M16 5v22 M5 16h22"/>',
  trophy: '<path d="M9 5h14v9a7 7 0 0 1-14 0V5Z M9 8H5v3c0 4 2 6 5 6 M23 8h4v3c0 4-2 6-5 6 M16 21v5 M11 27h10"/>',
  team: '<circle cx="12" cy="11" r="4"/><path d="M4 26v-2c0-4 3.5-7 8-7s8 3 8 7v2 M22 7a4 4 0 0 1 0 8 M23 18c3 1 5 3 5 6v2"/>',
  chart: '<path d="M5 27h22 M8 24v-7h4v7 M15 24V9h4v15 M22 24V5h4v19"/>',
  portal: '<rect x="4" y="6" width="24" height="20" rx="2"/><path d="M4 12h24 M14 19h9 M19 15l4 4-4 4"/>',
  shield: '<path d="M16 3 27 7v8c0 7-4.5 11-11 14C9.5 26 5 22 5 15V7l11-4Z M11 16l3 3 7-7"/>',
  calendar: '<rect x="5" y="7" width="22" height="20" rx="2"/><path d="M10 4v6 M22 4v6 M5 13h22 M10 18h4 M18 18h4"/>',
  list: '<path d="M5 8h22 M5 16h22 M5 24h22 M10 5v6 M10 13v6 M10 21v6"/>',
  history: '<path d="M7 9a11 11 0 1 1-2 9 M4 5v6h6 M16 9v7l5 3"/>',
  gear: '<circle cx="16" cy="16" r="4"/><path d="M13 3h6l1 4 3 1 3-2 4 5-3 3v4l3 3-4 5-3-2-3 1-1 4h-6l-1-4-3-1-3 2-4-5 3-3v-4l-3-3 4-5 3 2 3-1 1-4Z"/>',
};
const icon = (name) => `<svg viewBox="0 0 32 32" aria-hidden="true">${iconPaths[name]}</svg>`;
const sportIcons = { Futebol: 'ball', Futsal: 'ball', 'Vôlei': 'volley', Basquete: 'basket', 'E-sports': 'gamepad', Handebol: 'plus' };
document.querySelectorAll('.hero-sports a[data-sport]').forEach((link) => {
  const glyph = link.querySelector('.hero-sport-icon');
  if (glyph) glyph.innerHTML = icon(sportIcons[link.dataset.sport]);
});

function textElement(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = String(value ?? '');
  return element;
}

getPublicHomepageData(document.documentElement.dataset.page === 'campeonatos' ? 'full' : document.documentElement.dataset.page === 'inicio' ? 'summary' : 'none').then(({ competitions, champions, competitionsStatus, championsStatus }) => {
  globalThis.TRPublicHomeData = { competitions, champions, competitionsStatus, championsStatus };
  window.dispatchEvent(new CustomEvent('tr:public-home-data', { detail: globalThis.TRPublicHomeData }));
  const mount = document.querySelector('#public-competitions');
  if (mount) {
    publicCrestObserver?.disconnect();
    mount.replaceChildren();
  }
  if (mount && competitionsStatus === 'ready' && competitions.length) {
    const grid = textElement('div', 'public-competition-grid', '');
    for (const competition of competitions) {
      const card = textElement('a', 'public-competition-card', '');
      card.id = `public-competition-${competition.id}`;
      card.href = `/c/${encodeURIComponent(competition.id)}`;
      const cover = textElement('span', 'public-competition-cover', '');
      const image = document.createElement('img');
      image.src = competition.sport === 'Futsal' ? '/assets/competition-futsal.webp' : '/assets/competition-football.webp';
      image.alt = '';
      image.loading = 'lazy';
      cover.append(image);
      const crest = document.createElement('img');
      crest.className = 'public-competition-crest';
      crest.src = competition.crestUrl || '/assets/official/06_escudo_padrao_tr_campeonatos-256.webp';
      crest.alt = `Escudo de ${competition.name}`;
      crest.loading = 'lazy';
      crest.decoding = 'async';
      crest.width = 256;
      crest.height = 256;
      crest.onerror = () => { crest.onerror = null; crest.src = '/assets/official/06_escudo_padrao_tr_campeonatos-256.webp'; };
      if (competition.crest_path) crest.dataset.crestPath = competition.crest_path;
      cover.append(crest);
      const body = textElement('span', 'public-competition-body', '');
      body.append(textElement('span', 'public-competition-eyebrow', `${competition.sport} · ${competition.status === 'active' ? 'Em andamento' : competition.status === 'archived' ? 'Arquivo' : 'Publicado'}`));
      body.append(textElement('strong', 'public-competition-name', competition.name));
      body.append(textElement('span', 'public-competition-action', 'Acompanhar campeonato →'));
      card.append(cover, body);
      grid.append(card);
    }
    mount.append(grid);
    grid.querySelectorAll('.public-competition-crest[data-crest-path]').forEach((image) => {
      if (publicCrestObserver) publicCrestObserver.observe(image);
      else hydratePublicCrest(image);
    });
  } else if (mount && competitionsStatus === 'ready') {
    const empty = textElement('div', 'public-empty-state', '');
    empty.append(textElement('span', 'public-empty-icon', '◇'));
    const copy = textElement('div', '', '');
    copy.append(textElement('h3', '', 'Ainda não há campeonatos publicados.'));
    copy.append(textElement('p', '', 'Quando um organizador publicar uma competição, ela aparecerá aqui para acompanhamento.'));
    empty.append(copy);
    mount.append(empty);
  } else if (mount) {
    const notice = textElement('div', 'public-data-notice', '');
    notice.setAttribute('role', 'status');
    notice.append(textElement('strong', '', 'Campeonatos indisponíveis no momento.'));
    notice.append(textElement('span', '', 'Não foi possível carregar a lista agora. Tente novamente em instantes.'));
    const retry = textElement('a', '', 'Tentar novamente →');
    retry.href = '/campeonatos';
    notice.append(retry);
    mount.append(notice);
  }

  renderChampionGallery(champions, championsStatus);
}).catch(() => {
  const mount = document.querySelector('#public-competitions');
  if (mount) {
    mount.replaceChildren();
    const notice = textElement('div', 'public-data-notice', '');
    notice.setAttribute('role', 'status');
    notice.append(textElement('strong', '', 'Campeonatos indisponíveis no momento.'));
    notice.append(textElement('span', '', 'Não foi possível carregar a lista agora. Tente novamente em instantes.'));
    mount.append(notice);
  }
});
['trophy', 'team', 'chart', 'list', 'calendar', 'history', 'portal', 'gear', 'shield'].forEach((name, index) => {
  const glyph = document.querySelectorAll('.intro-strip .strip-symbol')[index];
  if (glyph) glyph.innerHTML = icon(name);
});

function syncPageMode() {
  const inClassification = window.location.hash === '#classificacao';
  document.body.classList.toggle('classification-mode', inClassification);
  if (inClassification) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', syncPageMode);
syncPageMode();

document.querySelectorAll('.hero-sports a[data-sport]').forEach((link) => {
  link.addEventListener('click', () => {
    const sport = link.dataset.sport;
    requestAnimationFrame(() => {
      const card = [...document.querySelectorAll('.sport-card')].find((item) => item.textContent.includes(sport));
      card?.click();
    });
  });
});

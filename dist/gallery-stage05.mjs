import { getSignedCrestUrl } from './supabase-real-mode.mjs';

const byText = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = String(text ?? '');
  return node;
};

const fields = {
  sport: (title) => title.season?.competition?.sport || '',
  competition: (title) => title.season?.competition?.id || title.season?.competition?.name || '',
  season: (title) => title.season?.label || '',
  club: (title) => title.club?.id || '',
};

function fillFilter(select, records, key) {
  const values = new Map();
  for (const title of records) {
    const value = fields[key](title);
    if (!value) continue;
    const label = key === 'competition' ? title.season.competition.name : key === 'club' ? title.club.official_name : value;
    values.set(value, label);
  }
  for (const [value, label] of [...values].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

function championCard(title) {
  const card = byText('article', 'champion-record', '');
  const crestStage = byText('div', 'champion-card-crest', '');
  const initials = String(title.club?.official_name || 'Clube').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  const crest = byText('span', 'champion-crest-placeholder', initials);
  crest.setAttribute('role', 'img');
  crest.setAttribute('aria-label', 'Escudo público indisponível; identidade textual do clube');
  crestStage.append(crest);
  if (title.club?.crest_path) {
    getSignedCrestUrl(title.club.crest_path).then((url) => {
      if (!url || !crest.isConnected) return;
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Escudo original de ${title.club.official_name}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      crest.replaceWith(img);
    }).catch(() => {});
  }
  const medal = document.createElement('img');
  medal.className = 'champion-card-medal';
  medal.src = '/assets/gallery-silver-trophy.webp';
  medal.alt = '';
  medal.loading = 'lazy';
  const body = byText('div', 'champion-card-content', '');
  body.append(byText('span', 'champion-card-confirmed', 'TÍTULO OFICIAL CONFIRMADO'));
  body.append(byText('span', 'champion-card-kicker', `${title.season?.competition?.name || 'Competição'} · ${title.season?.label || 'Temporada'}`));
  body.append(byText('h4', '', title.club?.official_name || 'Clube campeão'));
  body.append(byText('p', '', `${title.season?.competition?.sport || 'Modalidade'} · Campeão${title.runnerUp?.official_name ? ` · Vice: ${title.runnerUp.official_name}` : ''}`));
  if (title.club?.id) {
    const link = byText('a', '', 'VER PERFIL E HISTÓRICO ↗');
    link.href = `/clubes/${encodeURIComponent(title.club.id)}`;
    body.append(link);
  }
  card.append(crestStage, medal, body);
  return card;
}

export function renderChampionGallery(champions, status) {
  const gallery = document.querySelector('.champions-empty');
  const filters = document.querySelector('.champions-filters');
  const count = document.querySelector('#champion-count');
  if (!gallery || !filters || !count) return;
  if (status !== 'ready' || !champions.length) {
    if (status !== 'ready') {
      count.textContent = 'Não foi possível carregar as conquistas agora. Tente novamente em instantes.';
    } else count.textContent = 'Nenhum título oficial publicado até agora.';
    return;
  }
  const selects = Object.fromEntries(Object.keys(fields).map((key) => [key, filters.querySelector(`[data-gallery-filter="${key}"]`)]));
  for (const [key, select] of Object.entries(selects)) fillFilter(select, champions, key);
  filters.hidden = false;
  gallery.classList.add('has-champions');
  const render = () => {
    const visible = champions.filter((title) => Object.entries(selects).every(([key, select]) => !select.value || fields[key](title) === select.value));
    gallery.replaceChildren(...visible.map(championCard));
    if (!visible.length) gallery.append(byText('p', 'champions-filter-empty', 'Nenhuma conquista confirmada corresponde a estes filtros.'));
    count.textContent = `${visible.length} ${visible.length === 1 ? 'conquista confirmada' : 'conquistas confirmadas'}${visible.length !== champions.length ? ` de ${champions.length} disponíveis` : ''}.`;
  };
  filters.addEventListener('change', render);
  render();
}

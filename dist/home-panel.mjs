import { calculateStandings, generateFixtures, updateResult } from './engine.mjs';
import { safeCrestUrl } from './club.mjs';
import { demoCrestPath } from './demo-crests.mjs';
import { ESPORTS_DEMO } from './esports-demo.mjs';
import { DEMO_TEAMS } from './demo-teams.mjs';

const STORAGE_KEY = 'tr-campeonatos-demo-v1';
const ZONES_KEY = 'tr-campeonatos-preview-zones-v1';
const SAMPLE_TEAMS = DEMO_TEAMS.map((team) => ({ ...team, id: `sample-${team.id}` }));
const sampleSchedule = generateFixtures(SAMPLE_TEAMS);
const SAMPLE = {
  name: 'Copa TR Demonstração', sport: 'Futebol', season: '', teams: SAMPLE_TEAMS,
  fixtures: updateResult(updateResult(sampleSchedule, sampleSchedule[0].id, 2, 1), sampleSchedule[1].id, 1, 1),
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function readLocalDemo() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.teams) && Array.isArray(saved.fixtures) && (saved.name || saved.teams.length || saved.fixtures.length)) {
      return { data: saved, local: true };
    }
  } catch { /* Keep the preview available if browser storage is unavailable. */ }
  return { data: SAMPLE, local: false };
}

let previewMode = 'esports';
function readDemo() {
  return previewMode === 'esports' ? { data: ESPORTS_DEMO, local: false, esports: true } : readLocalDemo();
}

function crest(team) {
  const src = safeCrestUrl(team?.crest);
  if (src) return `<img class="home-crest" src="${esc(src)}" alt="Escudo de ${esc(team.name)}" loading="lazy" decoding="async" width="128" height="128">`;
  if (team?.demoAsset && /^\/assets\/demo-(?:esports|teams)\/[A-Za-z0-9_-]+\.(?:png|jpe|jpeg|webp)$/.test(team.demoAsset)) return `<img class="home-crest home-crest-esports" src="${team.demoAsset}" alt="Escudo de ${esc(team.name)}" loading="lazy" decoding="async" width="128" height="128">`;
  const illustrative = demoCrestPath(team);
  if (illustrative) return `<span class="home-crest home-crest-demo" role="img" aria-label="Escudo fictício demonstrativo para ${esc(team.name)}; nenhum escudo cadastrado"><img src="${illustrative}" alt="" aria-hidden="true" loading="lazy" decoding="async" width="128" height="128"><small>DEMO</small></span>`;
  return '<span class="home-crest home-crest-placeholder" role="img" aria-label="Equipe removida, sem escudo">?</span>';
}

function teamName(team) {
  const name = esc(team?.name || 'Equipe removida');
  return team?.demoAsset ? `<a class="home-club-link" href="#clube-${encodeURIComponent(team.id)}">${name}</a>` : name;
}

function matchRow(match, byId) {
  const home = byId.get(match.homeId);
  const away = byId.get(match.awayId);
  const live = match.status === 'in_progress';
  const hasScore = match.homeScore !== null && match.awayScore !== null;
  const phase = live ? 'is-live' : hasScore ? 'is-final' : 'is-upcoming';
  const status = live ? '● AO VIVO' : hasScore ? '● FINALIZADA' : '◷ A DISPUTAR';
  return `<article class="home-fixture ${phase}"><div class="home-fixture-meta"><span>RODADA ${esc(match.round)}</span><span class="home-fixture-status">${status}</span></div><div class="home-fixture-main"><div class="home-fixture-side">${crest(home)}<strong>${teamName(home)}</strong></div><div class="home-fixture-center"><strong>${hasScore ? `${esc(match.homeScore)}<i>×</i>${esc(match.awayScore)}` : '<i>VS</i>'}</strong></div><div class="home-fixture-side away">${crest(away)}<strong>${teamName(away)}</strong></div></div>${!hasScore && !live ? '<small class="home-fixture-schedule">Data e horário a definir</small>' : ''}</article>`;
}

function readZones() {
  try {
    const value = JSON.parse(localStorage.getItem(ZONES_KEY) || '{}');
    return { qualified: Math.max(0, Math.min(32, Number.parseInt(value.qualified, 10) || 0)), eliminated: Math.max(0, Math.min(32, Number.parseInt(value.eliminated, 10) || 0)) };
  } catch { return { qualified: 0, eliminated: 0 }; }
}

let zones = readZones();
const panelIcon = (name) => {
  const paths = {
    trophy: '<path d="M8 5h16v9a8 8 0 0 1-16 0V5Zm0 3H4v4a6 6 0 0 0 5 6m15-10h4v4a6 6 0 0 1-5 6M16 22v5m-6 0h12"/>',
    teams: '<circle cx="11" cy="11" r="4"/><circle cx="22" cy="11" r="4"/><path d="M3 27v-3a8 8 0 0 1 16 0v3m-3-4a8 8 0 0 1 13 1v3"/>',
    player: '<circle cx="16" cy="9" r="5"/><path d="M6 28v-4a10 10 0 0 1 20 0v4H6Z"/>',
    ball: '<circle cx="16" cy="16" r="12"/><path d="m12 10 4-3 4 3-2 5h-4l-2-5Zm2 5-5 4 2 5m7-9 5 4-2 5M11 24l5 3 5-3"/>',
    goal: '<path d="M4 27V8h24v19M4 12h24M9 12v15m14-15v15M9 18h14"/>',
    calendar: '<rect x="5" y="7" width="22" height="21" rx="2"/><path d="M10 4v6m12-6v6M5 13h22m-16 5h4m4 0h3m-11 5h4"/>',
    table: '<rect x="4" y="5" width="24" height="22" rx="2"/><path d="M4 12h24M11 12v15M11 19h17"/>',
    ranking: '<path d="M5 27h22M7 24v-9h5v9m3 0V7h5v17m3 0v-5h5v5"/>',
    chart: '<path d="M4 27h24M6 22l7-7 5 4 8-11m-4 0h4v4"/>',
    history: '<path d="M7 10a11 11 0 1 1-2 10M4 5v7h7m5-4v8l5 3"/>',
  };
  return `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

function renderPanel() {
  const { data, local, esports } = readDemo();
  const byId = new Map(data.teams.map((team) => [team.id, team]));
  let standings = [];
  try { standings = calculateStandings(data.teams, data.fixtures.map((match) => match.status === 'in_progress' ? { ...match, homeScore: null, awayScore: null } : match)); } catch { /* The lab validates editable data; keep an empty preview for corrupted storage. */ }
  const played = data.fixtures.filter((match) => match.status !== 'in_progress' && match.homeScore !== null && match.awayScore !== null);
  const pending = data.fixtures.filter((match) => match.status === 'in_progress' || match.homeScore === null || match.awayScore === null).sort((left, right) => Number(right.status === 'in_progress') - Number(left.status === 'in_progress'));
  const upcoming = pending.slice(0, 3);
  const recent = played.slice(-2).reverse();
  const goals = played.reduce((sum, match) => sum + Number(match.homeScore) + Number(match.awayScore), 0);

  document.querySelector('#home-panel-source').textContent = esports ? `${data.name} · simulação visual; resultados fictícios · escudos fornecidos pelo usuário` : local ? `${data.name || 'Sua competição'} · dados deste navegador · escudos DEMO onde não cadastrados` : 'Exemplo fictício · dados e escudos ilustrativos';
  document.querySelectorAll('[data-preview-mode]').forEach((button) => { button.setAttribute('aria-pressed', String(button.dataset.previewMode === previewMode)); });
  document.querySelector('#home-standings-competition').textContent = data.name || 'Sua competição';
  const metrics = [
    ['trophy', data.name && data.fixtures.length ? '01' : '00', 'Campeonato ativo', local ? 'prévia local' : 'cenário fictício'],
    ['teams', String(data.teams.length).padStart(2, '0'), 'Equipes', 'cadastradas'],
    ['player', '—', 'Jogadores', 'sem cadastro nesta versão'],
    ['ball', String(played.length).padStart(2, '0'), 'Partidas', 'realizadas'],
    ['goal', String(goals).padStart(2, '0'), 'Gols', 'marcados'],
    ['calendar', String(pending.length).padStart(2, '0'), 'Confrontos', 'a disputar'],
  ];
  document.querySelector('#home-dashboard-metrics').innerHTML = metrics.map(([icon, value, title, note]) => `<div class="home-metric"><span class="home-metric-icon">${panelIcon(icon)}</span><strong>${value}</strong><div><b>${title}</b><small>${note}</small></div></div>`).join('');
  document.querySelector('#home-next-matches').innerHTML = upcoming.length ? upcoming.map((match) => matchRow(match, byId)).join('') : '<p class="home-panel-empty">Nenhuma partida agendada. Gere confrontos no laboratório.</p>';
  document.querySelector('#home-recent-results').innerHTML = recent.length ? recent.map((match) => matchRow(match, byId)).join('') : '<p class="home-panel-empty">Os resultados registrados aparecerão aqui.</p>';
  const qualified = Math.min(zones.qualified, standings.length);
  const eliminated = Math.min(zones.eliminated, standings.length - qualified);
  document.querySelector('#home-standings').innerHTML = standings.length ? standings.slice(0, 8).map((row, index) => {
    const team = byId.get(row.id);
    const zone = index < qualified ? ' qualified' : index >= standings.length - eliminated ? ' eliminated' : '';
    return `<tr class="${index === 0 ? 'leader' : ''}${zone}"><td>${index + 1}</td><td><span class="home-table-team">${crest(team)}<span>${teamName(team)}</span></span></td><td class="pts">${row.points}</td><td>${row.played}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.goalsFor}</td><td>${row.goalsAgainst}</td><td>${row.goalDifference > 0 ? '+' : ''}${row.goalDifference}</td></tr>`;
  }).join('') : '<tr><td colspan="10">Cadastre equipes para iniciar a classificação.</td></tr>';
  document.querySelector('#home-dashboard-footer').textContent = esports ? 'Copa TR Demonstração: cenário exclusivamente visual, com resultados simulados. Os seis escudos foram fornecidos pelo usuário. Nada foi gravado no Supabase ou no laboratório.' : `Placares e classificação atualizados pelos dados da ${local ? 'demonstração deste navegador' : 'amostra fictícia'}. Escudos marcados DEMO são fictícios e aparecem somente quando não há imagem cadastrada. Faixas coloridas são apenas destaques visuais configuráveis.`;
  const eligible = standings.filter((row) => row.played > 0);
  const leader = played.length ? standings[0] : null;
  const attack = eligible.reduce((best, row) => !best || row.goalsFor > best.goalsFor ? row : best, null);
  const average = played.length ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(goals / played.length) : '—';
  document.querySelector('#home-insights').innerHTML = [
    ['LÍDER DA TABELA', leader ? leader.name : 'A definir', leader ? `${leader.points} pontos` : 'Aguardando resultados'],
    ['MELHOR ATAQUE', attack ? attack.name : 'A definir', attack ? `${attack.goalsFor} gols` : 'Aguardando resultados'],
    ['MÉDIA DE GOLS', average, played.length ? 'por partida finalizada' : 'Aguardando resultados'],
  ].map(([label, value, note]) => `<div class="home-insight"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></div>`).join('');
  document.querySelector('#home-zone-qualified').value = String(zones.qualified);
  document.querySelector('#home-zone-eliminated').value = String(zones.eliminated);
  document.querySelector('.home-zone-legend').classList.toggle('has-zones', Boolean(qualified || eliminated));
  renderSpotlight(data, local);
}

let publicData = globalThis.TRPublicHomeData || null;

function spotlightCard({ image, imageAlt, label, title, meta, note, href, action }) {
  const actionMarkup = href ? `<a href="${esc(href)}">${esc(action)} <span aria-hidden="true">→</span></a>` : `<span class="home-card-unavailable">Detalhes em preparação</span>`;
  const identity = String(title || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  return `<article class="home-competition-card"><div class="home-competition-image"><img src="${image}" alt="${esc(imageAlt)}" loading="lazy" width="720" height="480"><span>${esc(label)}</span></div><div class="home-competition-body"><div class="home-competition-title"><span class="home-competition-identity" aria-label="Iniciais da competição">${esc(identity)}</span><h4>${esc(title)}</h4></div><p>${esc(meta)}</p><small>${esc(note)}</small>${actionMarkup}</div></article>`;
}

function renderSpotlight() {
  const publicCompetitions = publicData?.competitionsStatus === 'ready' ? publicData.competitions : [];
  const cards = publicCompetitions.length ? publicCompetitions.slice(0, 2).map((competition) => spotlightCard({
    image: competition.sport === 'Futsal' ? '/assets/competition-futsal.webp' : '/assets/competition-football.webp',
    imageAlt: 'Imagem esportiva ilustrativa', label: 'COMPETIÇÃO PÚBLICA', title: competition.name,
    meta: competition.sport, note: `${{ active: 'Em andamento', draft: 'Rascunho', archived: 'Arquivada' }[competition.status] || 'Status não informado'} · imagem ilustrativa`,
    href: `/c/${encodeURIComponent(competition.id)}`, action: 'Ver campeonato',
  })) : [];
  document.querySelector('#home-spotlight-cards').innerHTML = cards.length ? cards.join('') : `<div class="home-spotlight-empty">${publicData?.competitionsStatus === 'ready' ? 'Nenhum campeonato publicado por enquanto.' : publicData ? 'Não foi possível carregar os campeonatos agora.' : 'Carregando campeonatos…'}</div>`;
  document.querySelector('#home-spotlight-note').textContent = 'Somente competições publicadas aparecem nesta área.';
}

document.querySelectorAll('[data-panel-icon]').forEach((element) => {
  const holder = element.matches('a') ? element.querySelector('span') : element;
  if (holder) holder.innerHTML = panelIcon(element.dataset.panelIcon);
});
window.addEventListener('tr:demo-updated', renderPanel);
window.addEventListener('storage', renderPanel);
window.addEventListener('tr:public-home-data', (event) => { publicData = event.detail; renderPanel(); });
document.querySelectorAll('[data-preview-mode]').forEach((button) => button.addEventListener('click', () => { previewMode = button.dataset.previewMode; renderPanel(); }));
for (const [selector, tab] of [['.home-preview-switch a', 'matches'], ['.home-matches-card .home-dashboard-card-head a', 'matches'], ['.home-results-card .home-dashboard-card-head a', 'matches'], ['.home-standings-card .home-dashboard-card-head a', 'standings'], ['.home-insights-card .home-dashboard-card-head a', 'statistics']]) {
  const link = document.querySelector(selector);
  if (link) { link.href = '#plataforma'; link.addEventListener('click', () => window.dispatchEvent(new CustomEvent('tr:open-showcase-tab', { detail: tab }))); }
}
document.querySelectorAll('#home-zone-qualified, #home-zone-eliminated').forEach((input) => input.addEventListener('change', () => {
  zones = {
    qualified: Math.max(0, Math.min(32, Number.parseInt(document.querySelector('#home-zone-qualified').value, 10) || 0)),
    eliminated: Math.max(0, Math.min(32, Number.parseInt(document.querySelector('#home-zone-eliminated').value, 10) || 0)),
  };
  try { localStorage.setItem(ZONES_KEY, JSON.stringify(zones)); } catch { /* The visual preference still works for this page. */ }
  renderPanel();
}));
renderPanel();

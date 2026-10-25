import { MAX_TEAMS, normalizeName, validateTeamName, generateFixtures, updateResult, calculateStandings } from './engine.mjs';
import { readCrestFile, safeCrestUrl } from './club.mjs';
import { getRealModeStatus } from './supabase-real-mode.mjs';
import { DEMO_TEAMS } from './demo-teams.mjs';

const STORAGE_KEY = 'tr-campeonatos-demo-v1';
const emptyState = () => ({ name: '', season: '', sport: 'Futebol', format: 'single', teams: [], fixtures: [] });
let state = loadState();
let activeTab = 'config';
let selectedRound = 1;
let editingId = null;
const content = document.querySelector('#lab-content');

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.teams) && Array.isArray(saved.fixtures)) {
      return { ...emptyState(), ...saved };
    }
  } catch { /* A malformed or unavailable local store starts a fresh demo. */ }
  return emptyState();
}

function saveState(message = 'Salvo neste navegador') {
  let saved = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    document.querySelector('#save-status').textContent = message;
  } catch {
    saved = false;
    document.querySelector('#save-status').textContent = 'Armazenamento indisponível';
    notify('Não foi possível salvar no navegador. Os dados podem se perder.', true);
  }
  updatePreview();
  window.dispatchEvent(new Event('tr:demo-updated'));
  return saved;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
function crest(team, className = 'club-crest') {
  const src = safeCrestUrl(team?.crest) || team?.demoAsset;
  return src ? `<img class="${className}" src="${src}" alt="Escudo de ${esc(team.name)}">` : `<span class="${className} club-crest-empty" aria-label="Sem escudo cadastrado">◇</span>`;
}
function clubLink(id, label) { return `<a class="club-link" href="#clube-${encodeURIComponent(id)}">${label}</a>`; }
function teamById(id) { return state.teams.find((team) => team.id === id); }
function clubLabel(id) {
  const team = teamById(id);
  return team ? clubLink(team.id, `${crest(team)}<span>${esc(team.name)}</span>`) : '<span>Equipe removida</span>';
}

function notify(message, error = false) {
  document.querySelector('.feedback')?.remove();
  const el = document.createElement('div');
  el.className = `feedback${error ? ' error' : ''}`;
  el.setAttribute('role', error ? 'alert' : 'status');
  el.textContent = message;
  document.body.append(el);
  window.setTimeout(() => el.remove(), 4500);
}

function teamName(id) { return state.teams.find((team) => team.id === id)?.name ?? 'Equipe removida'; }
function formatName() { return state.format === 'double' ? 'Turno e returno' : 'Turno único'; }
function playedCount() { return state.fixtures.filter((m) => m.homeScore !== null && m.awayScore !== null).length; }

function updatePreview() {
  renderHeroPreview();
}

function renderHeroPreview() {
  if (!document.querySelector('#hero-data-source')) return;
  const hasLocalDemo = Boolean(state.name || state.teams.length || state.fixtures.length);
  const sampleNames = ['BONOCO CITY', 'RESENHA CLUBE', 'IRMANDADE ES', 'ÁGUIA ES', 'OS SUPERSTAIS', 'GAROTOS DE POMBAL'];
  const sampleStandings = [3, 1, 1, 0, 0, 0];
  const rows = hasLocalDemo ? calculateStandings(state.teams, state.fixtures).slice(0, 4) : sampleNames.map((name, index) => ({ name, points: sampleStandings[index] }));
  const games = hasLocalDemo ? [...state.fixtures.filter((match) => match.homeScore === null), ...state.fixtures.filter((match) => match.homeScore !== null)].slice(0, 3).map((match) => ({
    home: teamName(match.homeId), away: teamName(match.awayId),
    detail: match.homeScore === null ? `Rodada ${match.round}` : `${match.homeScore} × ${match.awayScore}`,
  })) : [
    { home: 'BONOCO CITY', away: 'RESENHA CLUBE', detail: 'Próximo jogo' },
    { home: 'IRMANDADE ES', away: 'ÁGUIA ES', detail: 'Próximo jogo' },
    { home: 'OS SUPERSTAIS', away: 'GAROTOS DE POMBAL', detail: 'Próximo jogo' },
  ];
  document.querySelector('#hero-data-source').textContent = hasLocalDemo ? 'Dados deste navegador' : 'Exemplo fictício';
  document.querySelector('#hero-championship-count').textContent = hasLocalDemo ? (state.name ? '01' : '00') : '01';
  document.querySelector('#hero-team-count').textContent = String(hasLocalDemo ? state.teams.length : 6).padStart(2, '0');
  document.querySelector('#hero-game-count').textContent = String(hasLocalDemo ? state.fixtures.length : 15).padStart(2, '0');
  document.querySelector('#hero-matches').innerHTML = games.length ? games.map((game) => `<div class="system-match"><div><strong>${esc(game.home)}</strong><small> × ${esc(game.away)}</small></div><span class="system-match-score">${esc(game.detail)}</span></div>`).join('') : '<div class="system-match"><small>Gere confrontos no laboratório.</small></div>';
  document.querySelector('#hero-standings').innerHTML = rows.length ? rows.map((row, index) => `<div class="system-standing"><span><b>${index + 1}</b>${esc(row.name)}</span><strong>${row.points}</strong></div>`).join('') : '<div class="system-standing"><span>Cadastre as equipes.</span></div>';
  document.querySelector('#hero-float-title').textContent = hasLocalDemo ? (state.name || 'Campeonato de demonstração') : 'Copa TR Demonstração';
  document.querySelector('#hero-float-subtitle').textContent = `${hasLocalDemo ? state.sport : 'Futebol'} • ${hasLocalDemo ? state.teams.length : 6} equipes`;
  const featured = hasLocalDemo ? state.fixtures[0] : null;
  document.querySelector('#hero-float-match').innerHTML = featured ? `${esc(teamName(featured.homeId))} <b>${featured.homeScore === null ? '×' : `${featured.homeScore} × ${featured.awayScore}`}</b> ${esc(teamName(featured.awayId))}` : hasLocalDemo ? 'Aguardando confrontos' : 'BONOCO CITY <b>2 × 1</b> RESENHA CLUBE';
  const liveHome = featured ? teamName(featured.homeId) : 'BONOCO CITY';
  const liveAway = featured ? teamName(featured.awayId) : 'RESENHA CLUBE';
  const liveScore = featured && featured.homeScore !== null ? `${featured.homeScore} <span>×</span> ${featured.awayScore}` : '3 <span>×</span> 2';
  document.querySelector('#hero-live-home').textContent = liveHome;
  document.querySelector('#hero-live-away').textContent = liveAway;
  document.querySelector('#hero-live-score').innerHTML = liveScore;
  document.querySelector('#hero-live-minute').textContent = featured ? (featured.homeScore !== null ? 'Resultado local' : 'A disputar') : 'Exemplo';
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.lab-tab').forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  render();
}

window.addEventListener('tr:open-lab-tab', (event) => {
  if (['config', 'matches', 'standings', 'portal'].includes(event.detail)) setTab(event.detail);
});

function render() {
  if (activeTab === 'config') renderConfig();
  if (activeTab === 'matches') renderMatches();
  if (activeTab === 'standings') renderStandings();
  if (activeTab === 'portal') renderPortal();
  updatePreview();
}

function renderConfig() {
  const editing = state.teams.find((team) => team.id === editingId);
  const configDone = Boolean(state.name);
  const teamsDone = state.teams.length >= 2;
  const matchesDone = state.fixtures.length > 0;
  const realMode = getRealModeStatus();
  const persistence = realMode.mode === 'real-ready' ? 'Supabase configurado; autenticação ativa.' : realMode.mode === 'auth-required' ? 'Supabase configurado; entre para operar dados reais.' : 'Supabase ainda não configurado neste ambiente.';
  content.innerHTML = `
    <div class="lab-title"><div><h3>Configure seu campeonato</h3><p>Defina a competição e os participantes para gerar confrontos.</p></div><span class="lab-step">CONFIGURAÇÃO</span></div>
    <aside class="persistence-notice" aria-label="Status da persistência"><strong>Modo demonstração local</strong><span>Estes dados ficam neste navegador e não entram no histórico permanente. ${esc(persistence)}</span></aside>
    <div class="lab-progress" aria-label="Progresso da demonstração"><div class="progress-item ${configDone ? 'done' : ''}"><span>01</span><div><strong>Campeonato</strong><small>${configDone ? 'Definido' : 'A definir'}</small></div></div><div class="progress-item ${teamsDone ? 'done' : ''}"><span>02</span><div><strong>Participantes</strong><small>${state.teams.length} ${state.teams.length === 1 ? 'equipe' : 'equipes'}</small></div></div><div class="progress-item ${matchesDone ? 'done' : ''}"><span>03</span><div><strong>Confrontos</strong><small>${matchesDone ? `${state.fixtures.length} gerados` : 'A gerar'}</small></div></div></div>
    <div class="config-grid">
      <form id="competition-form" class="form-card"><div class="card-heading"><span class="card-index">01</span><div><h4>Informações do campeonato</h4><p>Nome e modalidade da demonstração.</p></div></div>
        <div class="field"><label for="competition-name">Nome do campeonato</label><input id="competition-name" name="name" value="${esc(state.name)}" maxlength="70" placeholder="Ex.: Copa TR de Verão" required></div>
        <div class="field"><label for="competition-season">Temporada (opcional)</label><input id="competition-season" name="season" value="${esc(state.season || '')}" maxlength="40" placeholder="Ex.: 2026"></div>
        <div class="field"><label for="competition-sport">Modalidade</label><select id="competition-sport" name="sport">${['Futebol','Futsal','Vôlei','Basquete','E-sports'].map((sport) => `<option ${state.sport === sport ? 'selected' : ''}>${sport}</option>`).join('')}</select></div>
        <div class="card-divider"></div><div class="card-section-heading"><h5>Formato da competição</h5><span>PONTOS CORRIDOS</span></div>
        <div class="field"><label>Formato disponível nesta versão</label><div class="segmented"><label><input type="radio" name="format" value="single" ${state.format === 'single' ? 'checked' : ''}><span>Turno único</span></label><label><input type="radio" name="format" value="double" ${state.format === 'double' ? 'checked' : ''}><span>Turno e returno</span></label></div><span class="field-help">Regras atuais: vitória 3 pontos, empate 1 ponto.</span></div>
        <div class="form-actions card-actions"><span class="status-line">${matchesDone ? `${state.fixtures.length} partidas geradas` : 'Nenhuma partida gerada'}</span><button class="button button-primary" type="submit">Salvar configuração</button></div>
      </form>
      <div class="form-card"><div class="card-heading"><span class="card-index">02</span><div><h4>Participantes</h4><p>Cadastre as equipes do campeonato.</p></div><span class="team-count">${state.teams.length}/${MAX_TEAMS}</span></div>
        <form id="team-form" class="team-form club-team-form"><label class="sr-only" for="team-name">Nome da equipe</label><input class="team-input" id="team-name" name="team" maxlength="50" value="${esc(editing?.name || '')}" placeholder="Nome da equipe" aria-label="Nome da equipe" required><div class="club-extra-fields"><label>Escudo PNG, JPG ou WEBP <small>até 300 KB</small><input id="team-crest" type="file" name="crest" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"></label><label>Categoria (opcional)<input name="category" maxlength="40" value="${esc(editing?.category || '')}" placeholder="Ex.: Adulto"></label><label>Sigla (opcional)<input name="shortName" maxlength="10" value="${esc(editing?.shortName || '')}" placeholder="Ex.: FFC"></label><label>Cor de destaque (opcional)<input name="color" type="color" value="${/^#[0-9a-fA-F]{6}$/.test(editing?.color || '') ? editing.color : '#087cff'}"></label><label class="club-notes-label">Descrição (opcional)<textarea name="notes" maxlength="240" rows="2" placeholder="Apresentação da equipe">${esc(editing?.notes || '')}</textarea></label></div>${editing?.crest ? `<label class="club-remove-crest"><input name="removeCrest" type="checkbox"> Remover escudo atual</label>` : ''}<div class="club-form-actions"><button class="small-action" type="submit">${editing ? 'Salvar equipe' : '+ Adicionar equipe'}</button>${editing ? '<button class="icon-btn" type="button" id="cancel-edit">Cancelar</button>' : ''}</div></form>
        <ul class="teams-list">${state.teams.map((team, index) => `<li><span class="team-badge">${index + 1}</span>${crest(team)}<span class="team-name">${clubLink(team.id, esc(team.name))}</span><button class="icon-btn" data-edit="${esc(team.id)}" type="button" aria-label="Editar ${esc(team.name)}">Editar</button><button class="icon-btn danger" data-delete="${esc(team.id)}" type="button" aria-label="Excluir ${esc(team.name)}">Excluir</button></li>`).join('') || '<li class="inline-note">Adicione pelo menos duas equipes.</li>'}</ul>
        <div class="form-actions"><span class="inline-note">${matchesDone ? 'Alterar participantes apagará os confrontos atuais.' : 'Nomes únicos, de 2 a 50 caracteres.'}</span></div>
      </div>
    </div>
    <div class="form-actions config-footer"><button class="button button-outline" id="load-example" type="button">Carregar exemplo fictício</button><button class="button button-primary" id="generate" type="button">Gerar confrontos →</button></div>`;
}

function renderMatches() {
  if (!state.fixtures.length) {
    content.innerHTML = `<div class="lab-title"><div><h3>Central de partidas</h3><p>Resultados da sua competição fictícia.</p></div><span class="lab-step">ETAPA 03</span></div><div class="empty-state"><div class="empty-icon">◫</div><h4>O campo está pronto</h4><p>Cadastre as equipes e gere os confrontos para lançar os placares.</p><button class="button button-primary" data-go="config">Configurar competição →</button></div>`;
    return;
  }
  const rounds = [...new Set(state.fixtures.map((m) => m.round))];
  if (!rounds.includes(selectedRound)) selectedRound = rounds[0];
  const fixtures = state.fixtures.filter((m) => m.round === selectedRound);
  content.innerHTML = `<div class="lab-title"><div><h3>Central de partidas</h3><p>${state.fixtures.length} confrontos • ${playedCount()} ${playedCount() === 1 ? 'resultado registrado' : 'resultados registrados'}</p></div><label class="round-select">Rodada <select id="round-select">${rounds.map((round) => `<option value="${round}" ${round === selectedRound ? 'selected' : ''}>${round}</option>`).join('')}</select></label></div>
    <div class="match-list">${fixtures.map((match) => {
      const played = match.homeScore !== null;
      const home = esc(teamName(match.homeId));
      const away = esc(teamName(match.awayId));
      return `<form class="match-card match-form ${played ? 'played' : 'pending'}" data-match-id="${esc(match.id)}">
        <div class="match-head"><span class="match-round-label">RODADA ${String(match.round).padStart(2, '0')}</span><span class="match-status">${played ? 'Resultado registrado' : 'Aguardando resultado'}</span></div>
        <div class="match-row"><div class="match-team" title="${home}"><small>MANDANTE</small><strong>${clubLabel(match.homeId)}</strong></div><div class="match-scoreboard"><input class="score-input" name="homeScore" inputmode="numeric" type="number" min="0" max="99" value="${match.homeScore ?? ''}" aria-label="Placar de ${home}"><span class="score-dash">×</span><input class="score-input" name="awayScore" inputmode="numeric" type="number" min="0" max="99" value="${match.awayScore ?? ''}" aria-label="Placar de ${away}"></div><div class="match-team away" title="${away}"><small>VISITANTE</small><strong>${clubLabel(match.awayId)}</strong></div></div>
        <div class="match-meta"><span>Ambiente de demonstração</span><div>${match.history?.length ? `<button class="history-toggle" type="button" data-history="${esc(match.id)}">Ver histórico (${match.history.length})</button>` : ''}<button class="small-action match-save" type="submit">${played ? 'Corrigir resultado' : 'Registrar resultado'}</button></div></div>
        <ol class="history-list" id="history-${esc(match.id)}" hidden>${(match.history ?? []).map((record) => `<li>${record.homeScore} × ${record.awayScore} • alterado em ${esc(new Date(record.changedAt).toLocaleString('pt-BR'))}</li>`).join('')}</ol>
      </form>`;
    }).join('')}</div><div class="form-actions"><span class="inline-note">Os placares são fictícios. Você pode corrigi-los a qualquer momento.</span><button class="button button-outline" id="simulate-round" type="button">Simular esta rodada</button></div>`;
}

function standingsTable() {
  const standings = calculateStandings(state.teams, state.fixtures);
  return `<p class="table-scroll-hint">Deslize a tabela para ver todas as estatísticas →</p><div class="table-wrap" role="region" aria-label="Tabela de classificação; deslize horizontalmente para ver todas as colunas" tabindex="0"><table class="standings-table"><thead><tr><th>POS</th><th>Equipe</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th></tr></thead><tbody>${standings.map((row, index) => `<tr><td>${index + 1}</td><td>${clubLabel(row.id)}</td><td>${row.points}</td><td>${row.played}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.goalsFor}</td><td>${row.goalsAgainst}</td><td>${row.goalDifference > 0 ? '+' : ''}${row.goalDifference}</td><td>${row.performance}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderStandings() {
  if (!state.teams.length) {
    content.innerHTML = `<div class="lab-title"><div><h3>Classificação</h3><p>A tabela será calculada automaticamente.</p></div></div><div class="empty-state"><div class="empty-icon">▥</div><h4>Nenhuma equipe cadastrada</h4><p>Comece configurando uma competição de demonstração.</p><button class="button button-primary" data-go="config">Começar →</button></div>`;
    return;
  }
  content.innerHTML = `<div class="lab-title"><div><h3>Classificação</h3><p>${esc(state.name || 'Campeonato de demonstração')} • ${esc(state.sport)} • ${state.teams.length} equipes • ${playedCount()} de ${state.fixtures.length} partidas com resultado</p></div><span class="lab-step">ATUALIZAÇÃO AUTOMÁTICA</span></div>${standingsTable()}<p class="table-note">Critérios de desempate: pontos, vitórias, saldo de gols, gols marcados e nome. Aproveitamento = pontos conquistados ÷ pontos possíveis. Dados de demonstração.</p>`;
}

function renderPortal() {
  const standings = calculateStandings(state.teams, state.fixtures);
  const upcoming = state.fixtures.filter((m) => m.homeScore === null).slice(0, 4);
  const recent = [...state.fixtures].filter((m) => m.homeScore !== null).reverse().slice(0, 4);
  content.innerHTML = `<div class="lab-title"><div><h3>Prévia do portal público</h3><p>Visualização local dos dados criados neste navegador.</p></div><span class="lab-step">DADOS FICTÍCIOS</span></div><div class="portal-head"><span class="demo-pill">PRÉVIA • NÃO PUBLICADO</span><h3>${esc(state.name || 'Seu campeonato')}</h3><p>${esc(state.sport)} • ${formatName()}${state.season ? ` • ${esc(state.season)}` : ''} • ${state.teams.length} equipes</p></div><div class="portal-grid"><div class="panel-card"><h4>Próximos jogos</h4>${upcoming.map((m) => `<div class="portal-match"><span>R${m.round} · ${clubLabel(m.homeId)} × ${clubLabel(m.awayId)}</span><span>A disputar</span></div>`).join('') || '<p class="inline-note">Nenhuma partida pendente.</p>'}<h4 style="margin-top:24px">Últimos resultados</h4>${recent.map((m) => `<div class="portal-match"><span>${clubLabel(m.homeId)} × ${clubLabel(m.awayId)}</span><span>${m.homeScore} × ${m.awayScore}</span></div>`).join('') || '<p class="inline-note">Nenhum resultado registrado.</p>'}</div><div class="panel-card"><h4>Classificação</h4>${standings.map((row, index) => `<div class="portal-table-row"><span>${index + 1}. ${clubLabel(row.id)}</span><b>${row.points} pts</b></div>`).join('') || '<p class="inline-note">Cadastre equipes para ver a tabela.</p>'}</div></div>`;
}

function resetFixturesWithConfirmation() {
  if (!state.fixtures.length) return true;
  return window.confirm('Alterar equipes ou formato apagará os confrontos e resultados atuais desta demonstração. Continuar?');
}

document.querySelector('#menu-toggle').addEventListener('click', (event) => {
  const nav = document.querySelector('#main-nav');
  const open = nav.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
  event.currentTarget.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
document.querySelectorAll('#main-nav a').forEach((link) => link.addEventListener('click', () => {
  document.querySelector('#main-nav').classList.remove('open');
  document.querySelector('#menu-toggle').setAttribute('aria-expanded', 'false');
  document.querySelector('#menu-toggle').setAttribute('aria-label', 'Abrir menu');
}));
const navSections = [...document.querySelectorAll('#main-nav a[href^="#"]')].map((link) => ({ link, section: document.querySelector(link.getAttribute('href')) })).filter(({ section }) => section);
if ('IntersectionObserver' in window) {
  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navSections.forEach(({ link, section }) => {
      const active = section === visible.target;
      link.classList.toggle('nav-active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: [0, .15, .5] });
  navSections.forEach(({ section }) => navObserver.observe(section));
}
document.querySelectorAll('.lab-tab').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
document.querySelector('#reset-demo').addEventListener('click', () => {
  if (!window.confirm('Apagar todos os dados desta demonstração neste navegador?')) return;
  state = emptyState(); editingId = null; selectedRound = 1; saveState('Laboratório reiniciado'); setTab('config'); notify('Laboratório reiniciado.');
});

content.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === 'competition-form') {
      const data = new FormData(form);
      const name = normalizeName(data.get('name'));
      const season = normalizeName(data.get('season'));
      if (name.length < 3 || name.length > 70) throw new Error('O nome do campeonato deve ter entre 3 e 70 caracteres.');
      if (season.length > 40) throw new Error('A temporada deve ter até 40 caracteres.');
      const sport = String(data.get('sport'));
      const format = String(data.get('format'));
      if (!['Futebol','Futsal','Vôlei','Basquete','E-sports'].includes(sport) || !['single','double'].includes(format)) throw new Error('Selecione uma configuração válida.');
      if (format !== state.format && !resetFixturesWithConfirmation()) return;
      if (format !== state.format) state.fixtures = [];
      state.name = name; state.season = season; state.sport = sport; state.format = format;
      saveState(); render(); notify('Configuração salva.');
    } else if (form.id === 'team-form') {
      const data = new FormData(form);
      const name = validateTeamName(data.get('team'), state.teams, editingId);
      const category = normalizeName(data.get('category'));
      const shortName = normalizeName(data.get('shortName')).toUpperCase();
      const notes = String(data.get('notes') || '').trim();
      const color = String(data.get('color') || '#087cff');
      if (category.length > 40 || shortName.length > 10 || notes.length > 240 || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Confira os dados opcionais da equipe.');
      if (!editingId && state.teams.length >= MAX_TEAMS) throw new Error(`Limite de ${MAX_TEAMS} equipes nesta demonstração.`);
      if (!editingId && !resetFixturesWithConfirmation()) return;
      const existing = state.teams.find((team) => team.id === editingId);
      const file = data.get('crest');
      let crestUrl = data.get('removeCrest') ? null : existing?.crest || null;
      if (file instanceof File && file.size) crestUrl = await readCrestFile(file, state.teams, editingId);
      const nextTeam = { ...(existing || { id: crypto.randomUUID() }), name, category, shortName, notes, color, crest: crestUrl };
      const previousTeams = state.teams;
      const previousFixtures = state.fixtures;
      if (editingId) state.teams = state.teams.map((team) => team.id === editingId ? nextTeam : team);
      else { state.teams = [...state.teams, nextTeam]; state.fixtures = []; }
      if (!saveState()) { state.teams = previousTeams; state.fixtures = previousFixtures; render(); return; }
      editingId = null; render(); notify('Equipe salva.');
      document.querySelector('#team-name')?.focus();
    } else if (form.classList.contains('match-form')) {
      const data = new FormData(form);
      state.fixtures = updateResult(state.fixtures, form.dataset.matchId, data.get('homeScore'), data.get('awayScore'));
      saveState(); render(); notify('Resultado salvo. Classificação atualizada.');
    }
  } catch (error) { notify(error.message, true); }
});

content.addEventListener('change', (event) => {
  if (event.target.id === 'round-select') { selectedRound = Number(event.target.value); render(); }
});

content.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.dataset.go) setTab(button.dataset.go);
    else if (button.dataset.edit) { editingId = button.dataset.edit; render(); document.querySelector('#team-name')?.focus(); }
    else if (button.id === 'cancel-edit') { editingId = null; render(); }
    else if (button.dataset.delete) {
      const team = state.teams.find((entry) => entry.id === button.dataset.delete);
      if (!team || !window.confirm(`Excluir ${team.name} da demonstração?${state.fixtures.length ? ' Os confrontos e resultados também serão apagados.' : ''}`)) return;
      state.teams = state.teams.filter((entry) => entry.id !== team.id);
      state.fixtures = [];
      editingId = null; saveState(); render(); notify('Equipe excluída.');
    } else if (button.id === 'generate') {
      const typedName = normalizeName(document.querySelector('#competition-name')?.value);
      if (typedName.length < 3) throw new Error('Informe e salve o nome do campeonato antes de gerar confrontos.');
      if (!state.name || typedName !== state.name) throw new Error('Salve a configuração antes de gerar confrontos.');
      if (state.fixtures.length && !window.confirm('Gerar novamente apagará os resultados atuais. Continuar?')) return;
      state.fixtures = generateFixtures(state.teams, state.format === 'double');
      selectedRound = 1; saveState(); setTab('matches'); notify(`${state.fixtures.length} confrontos gerados.`);
    } else if (button.id === 'load-example') {
      if ((state.teams.length || state.fixtures.length) && !window.confirm('Substituir os dados atuais por um exemplo fictício?')) return;
      state = { name: 'Copa TR Demonstração', sport: 'Futebol', format: 'single', teams: DEMO_TEAMS.map((team) => ({ ...team, id: crypto.randomUUID() })), fixtures: [] };
      editingId = null; saveState(); render(); notify('Exemplo fictício carregado. Gere os confrontos.');
    } else if (button.id === 'simulate-round') {
      if (!window.confirm('Gerar placares fictícios para todas as partidas desta rodada? Os placares existentes serão substituídos.')) return;
      for (const match of state.fixtures.filter((m) => m.round === selectedRound)) {
        state.fixtures = updateResult(state.fixtures, match.id, Math.floor(Math.random() * 5), Math.floor(Math.random() * 5));
      }
      saveState(); render(); notify('Rodada simulada. Classificação atualizada.');
    } else if (button.dataset.history) {
      const list = document.getElementById(`history-${button.dataset.history}`);
      if (list) list.hidden = !list.hidden;
    }
  } catch (error) { notify(error.message, true); }
});

document.querySelector('#year').textContent = new Date().getFullYear();

function refreshStaticDemoIdentity() {
  const [bonoco, resenha] = DEMO_TEAMS;
  document.querySelectorAll('.hero-live-team').forEach((node, index) => {
    const team = index === 0 ? bonoco : resenha;
    const image = node.querySelector('img');
    if (image) { image.src = team.demoAsset; image.alt = `Escudo do ${team.name}`; }
    const name = node.querySelector('span');
    if (name) name.textContent = team.name;
  });
  const source = document.querySelector('#home-panel-source');
  if (source) source.textContent = 'COPA TR DEMONSTRAÇÃO · simulação visual';
  const champion = document.querySelector('.champion-demo-card');
  if (champion) {
    const image = champion.querySelector('img');
    if (image) { image.src = bonoco.demoAsset; image.alt = `Escudo do ${bonoco.name}`; }
    champion.querySelector('.champion-card-kicker')?.replaceChildren('Copa TR Demonstração · vitrine');
    champion.querySelector('h4')?.replaceChildren(bonoco.name);
  }
  const publicMatch = document.querySelector('.public-demo-match');
  if (publicMatch) {
    const images = publicMatch.querySelectorAll('img');
    [bonoco, resenha].forEach((team, index) => {
      const image = images[index];
      if (image) { image.src = team.demoAsset; image.alt = `Escudo do ${team.name}`; }
    });
    const label = publicMatch.querySelector('p');
    if (label) label.innerHTML = `${esc(bonoco.name)} <span>·</span> ${esc(resenha.name)}`;
  }
}

refreshStaticDemoIdentity();
render();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

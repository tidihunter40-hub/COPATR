const content = document.querySelector('.tr-classification-content');
const navItems = [...document.querySelectorAll('[data-tr-page]')];
const topNavItems = [...document.querySelectorAll('[data-tr-top-page]')];
const classificationMarkup = content?.innerHTML || '';
const rowData = () => window.TRClassification?.rows || [];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const crest = (team) => `<span class="tr-crest ${team.crest}" aria-hidden="true">${esc(team.name[0])}</span>`;
const pageHead = (eyebrow, title, description, action = '') => `<header class="tr-page-head"><div><span class="tr-eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${action.replace('type="button"', 'type="button" disabled title="Disponível em etapa administrativa futura"')}</header>`;
const card = (title, body, className = '') => `<section class="tr-system-card ${className}"><header><span class="tr-panel-icon" aria-hidden="true"></span><b>${title}</b></header>${body}</section>`;

function fixture(home, away, date, round, venue, score = 'VS') {
  return `<article class="tr-match-white"><div class="tr-team-label">${crest(home)}<span>${esc(home.name)}<small>${round} · ${venue}</small></span></div><b>${score}</b><div class="tr-team-label"><span>${esc(away.name)}<small>${date}</small></span>${crest(away)}</div></article>`;
}

function dashboard() {
  const rows = rowData(); const leader = rows[0];
  const metrics = [['01', 'CAMPEONATO ATIVO', 'Copa TR de Verão'], ['01', 'COMPETIÇÃO ENCERRADA', 'Histórico preservado'], [String(rows.length).padStart(2, '0'), 'EQUIPES PARTICIPANTES', 'nesta temporada'], ['15', 'RESULTADOS CONFIRMADOS', 'dados da tabela']];
  return `<div class="tr-page">${pageHead('PAINEL DO ORGANIZADOR', 'Visão geral', 'Resumo operacional da Copa TR de Verão.', '<button class="tr-page-action" type="button">+ Criar campeonato</button>')}<div class="tr-system-grid tr-dashboard-grid">${metrics.map(([value, label, note]) => `<article class="tr-system-card tr-metric-card"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`).join('')}${card('PRÓXIMOS CONFRONTOS', `<div class="tr-match-list">${fixture(rows[0], rows[2], 'Hoje · 20:00', 'Rodada 6', 'Estádio Municipal')}${fixture(rows[1], rows[3], 'Hoje · 21:30', 'Rodada 6', 'Arena TR')}</div>`, 'paper tr-dashboard-wide')}${card('ATIVIDADES RECENTES', `<div class="tr-activity"><div><i></i>Resultado confirmado: ${esc(leader?.name || 'Equipe')} segue na liderança <time>agora</time></div><div><i></i>Classificação atualizada automaticamente <time>há 6 min</time></div><div><i></i>Rodada 6 pronta para acompanhamento <time>hoje</time></div></div>`, 'tr-dashboard-wide')}</div></div>`;
}

function championships() {
  const rows = rowData();
  return `<div class="tr-page">${pageHead('GESTÃO DE COMPETIÇÕES', 'Campeonatos', 'Encontre, acompanhe e organize suas competições.', '<button class="tr-page-action" type="button">+ Novo campeonato</button>')}<div class="tr-filters"><button class="tr-filter active">Todos</button><button class="tr-filter">Ativos</button><button class="tr-filter">Encerrados</button><button class="tr-filter">Futebol</button></div><div class="tr-competition-grid"><article class="tr-competition-card"><span class="tr-card-chip">EM ANDAMENTO</span><h2>Copa TR de Verão</h2><p>Futebol · Temporada 2026<br>Fase de grupos · ${rows.length} equipes</p><footer><span>15 partidas</span><span>Ver competição →</span></footer></article><article class="tr-competition-card"><span class="tr-card-chip">ENCERRADO</span><h2>Copa Metropolitana</h2><p>Futebol · Temporada 2025<br>Histórico disponível</p><footer><span>Campeão registrado</span><span>Ver detalhes →</span></footer></article><article class="tr-competition-card"><span class="tr-card-chip">RASCUNHO</span><h2>Novo campeonato</h2><p>Defina formato, participantes e regulamento antes de publicar.</p><footer><span>Aguardando organização</span><span>Continuar →</span></footer></article></div></div>`;
}

function teams() {
  const rows = rowData();
  return `<div class="tr-page">${pageHead('IDENTIDADE ESPORTIVA', 'Equipes', 'Perfis permanentes, participações e campanhas da temporada.', '<button class="tr-page-action" type="button">+ Cadastrar equipe</button>')}<div class="tr-team-grid">${rows.map((team, position) => `<article class="tr-team-card"><div>${crest(team)}<div><h2>${esc(team.name)}</h2><p>${position + 1}º lugar · ${team.points} pontos</p></div></div><footer><span>${team.played} jogos · ${team.goalsFor} gols</span><span>Histórico →</span></footer></article>`).join('')}</div></div>`;
}

function players() {
  return `<div class="tr-page">${pageHead('ELENCO E PERFIS', 'Jogadores', 'Perfis esportivos serão exibidos quando houver atletas cadastrados no banco.')}<section class="tr-system-card tr-empty"><div><span class="tr-empty-symbol" aria-hidden="true"></span><h2>Nenhum jogador cadastrado</h2><p>O cadastro de atletas ainda não possui registros no ambiente atual. Quando disponível, esta página mostrará somente dados vinculados às equipes e competições.</p></div></section></div>`;
}

function matches() {
  const rows = rowData();
  return `<div class="tr-page">${pageHead('CENTRAL DE PARTIDAS', 'Partidas', 'Acompanhe confrontos agendados, em andamento e finalizados.')}<div class="tr-filters"><button class="tr-filter active">Agendadas</button><button class="tr-filter">Em andamento</button><button class="tr-filter">Finalizadas</button></div>${card('RODADA 6 · FASE DE GRUPOS', `<div class="tr-match-list">${fixture(rows[0], rows[2], 'Hoje · 20:00', 'Rodada 6', 'Estádio Municipal')}${fixture(rows[1], rows[3], 'Hoje · 21:30', 'Rodada 6', 'Arena TR')}${fixture(rows[4], rows[5], 'Amanhã · 19:00', 'Rodada 6', 'Estádio Municipal')}</div>`, 'paper')}</div>`;
}

function bracket() {
  const rows = rowData(); const match = (a, b, score, champion = false) => `<div class="tr-bracket-match ${champion ? 'champion' : ''}"><div>${crest(a)} ${esc(a.name)} <b>${score[0]}</b></div><div>${crest(b)} ${esc(b.name)} <b>${score[1]}</b></div></div>`;
  return `<div class="tr-page">${pageHead('ELIMINATÓRIAS', 'Mata-mata', 'Visualização das fases concluídas e das próximas decisões.')}<section class="tr-system-card tr-bracket"><div class="tr-bracket-track"><div class="tr-bracket-column"><h3>OITAVAS DE FINAL</h3>${match(rows[0], rows[5], ['3', '0'])}${match(rows[1], rows[4], ['2', '1'])}</div><div class="tr-bracket-column"><h3>QUARTAS DE FINAL</h3>${match(rows[0], rows[3], ['2', '0'])}${match(rows[2], rows[1], ['1', '1'])}</div><div class="tr-bracket-column"><h3>SEMIFINAL</h3>${match(rows[0], rows[2], ['—', '—'])}</div><div class="tr-bracket-column"><h3>FINAL</h3>${match(rows[0], rows[1], ['—', '—'], true)}</div></div></section></div>`;
}

function stats() {
  const rows = rowData(); const bestAttack = [...rows].sort((a, b) => b.goalsFor - a.goalsFor)[0];
  return `<div class="tr-page">${pageHead('ANÁLISE DA COMPETIÇÃO', 'Estatísticas', 'Indicadores calculados com resultados confirmados.')}<div class="tr-system-grid tr-dashboard-grid"><article class="tr-system-card tr-metric-card"><small>MELHOR ATAQUE</small><strong>${bestAttack?.goalsFor ?? '—'}</strong><span>${esc(bestAttack?.name ?? 'Sem dados')}</span></article><article class="tr-system-card tr-metric-card"><small>MELHOR DEFESA</small><strong>${Math.min(...rows.map((team) => team.goalsAgainst))}</strong><span>gols sofridos</span></article><article class="tr-system-card tr-metric-card"><small>LÍDER ATUAL</small><strong>${rows[0]?.points ?? '—'}</strong><span>${esc(rows[0]?.name ?? 'Sem dados')}</span></article><article class="tr-system-card tr-metric-card"><small>APROVEITAMENTO</small><strong>${rows[0]?.performance ?? '—'}%</strong><span>melhor campanha</span></article></div>${card('DESEMPENHO DAS EQUIPES', `<div class="tr-chart">${rows.map((team) => `<div class="tr-chart-row"><span>${esc(team.name)}</span><div class="tr-chart-bar"><i style="width:${team.performance}%"></i></div><b>${team.performance}%</b></div>`).join('')}</div>`)}</div>`;
}

function champions() {
  const rows = rowData();
  return `<div class="tr-page">${pageHead('HISTÓRIA E CONQUISTAS', 'Galeria de Campeões', 'Prévia fictícia da galeria. Nenhum título oficial foi publicado.')}<div class="tr-competition-grid"><article class="tr-competition-card"><span class="tr-card-chip">SIMULAÇÃO VISUAL</span><h2>${esc(rows[0]?.name ?? 'Equipe de exemplo')}</h2><p>Copa Metropolitana · exemplo fictício<br>Futebol · Temporada 2025</p><footer><span>Sem título oficial</span><span>Prévia de trajetória →</span></footer></article><article class="tr-competition-card"><span class="tr-card-chip">EM DISPUTA · EXEMPLO</span><h2>Copa TR de Verão</h2><p>A definição do campeão será registrada após o encerramento autorizado da temporada.</p><footer><span>Temporada 2026</span><span>Classificação →</span></footer></article></div></div>`;
}

function settings() {
  return `<div class="tr-page">${pageHead('PREFERÊNCIAS DO ORGANIZADOR', 'Configurações', 'Ajustes disponíveis conforme as permissões da sua conta.')}<div class="tr-settings">${['Informações da organização', 'Notificações', 'Identidade da competição', 'Acesso e permissões'].map((title, index) => `<section class="tr-system-card tr-setting"><h2>${title}</h2><p>${index === 3 ? 'Permissões administrativas são controladas pelos vínculos do organizador.' : 'Configure as informações visíveis e a experiência operacional da plataforma.'}</p>${index === 3 ? '<div class="tr-toggle"><span>Exibir dados da equipe</span><i aria-hidden="true"></i></div>' : '<div class="tr-input-placeholder">Configuração disponível com autenticação</div>'}</section>`).join('')}</div></div>`;
}

const pages = { dashboard, championships, teams, players, matches, bracket, stats, champions, settings };
function showPage(name) {
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.trPage === name));
  topNavItems.forEach((item) => item.classList.toggle('selected', item.dataset.trTopPage === name));
  if (name === 'classification') {
    content.innerHTML = classificationMarkup;
    window.TRClassification?.renderTable();
    window.TRClassification?.selectTeam(rowData()[0]?.id);
    return;
  }
  content.innerHTML = pages[name]?.() || dashboard();
  content.querySelectorAll('.tr-filter').forEach((button) => { button.disabled = true; button.title = 'Filtro disponível em etapa administrativa futura'; });
}
navItems.forEach((item) => item.addEventListener('click', (event) => { event.preventDefault(); showPage(item.dataset.trPage); }));
topNavItems.forEach((item) => item.addEventListener('click', (event) => { event.preventDefault(); showPage(item.dataset.trTopPage); }));

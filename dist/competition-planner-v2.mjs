import { corujaoPlan, groupPlan, knockoutPlan, recommendCorujao, roundRobinPlan, scheduleFixtures } from './tr-competition-engine.mjs';
import { ESPORTS_TEAMS } from './esports-demo.mjs';

const form = document.querySelector('#planner-form');
const sportInput = document.querySelector('#planner-sport');
const countInput = document.querySelector('#planner-count');
const formatInput = document.querySelector('#planner-format');
const advanced = document.querySelector('#advanced-settings');
const result = document.querySelector('#plan-result');
const layout = document.querySelector('.planner-layout');
const errorBox = document.querySelector('#form-error');
const formatNames = { round_robin: 'Pontos corridos', groups: 'Fase de grupos', groups_knockout: 'Grupos + mata-mata', knockout: 'Mata-mata direto', corujao: 'Corujão' };
const demoNames = [
  'Falcões FC', 'Real Sports', 'União Atlético', 'Pombal City', 'Vila Operária', 'Atlético RS', 'Aurora FC', 'Estrela Azul',
  'Náutico Central', 'Monte Verde', 'Cruzeiro do Sul', 'Leões da Serra', 'Olimpo FC', 'Riviera Atlético', 'Guardiões FC', 'Horizonte SC',
  'Pioneiros', 'Nova Era FC', 'Esporte Clube Norte', 'Águia Branca', 'Tempestade FC', 'Imperial SC', 'Maré Alta', 'Arena Azul',
  'Vanguarda FC', 'Porto Real', 'Cidade Nova', 'Vila Norte', 'Aço Azul', 'Atlético Solar', 'Trovão FC', 'Central United',
];
const esportsNames = [
  ...ESPORTS_TEAMS.map((team) => team.name), 'Orbit E-Sports', 'Crown Gaming', 'Nova Squad', 'Thunder Crew', 'Blue Titans',
  'Silver Wolves', 'Vertex E-Sports', 'Zero Gravity', 'Pulse Gaming', 'Atlas Squad', 'Vortex E-Sports', 'North Stars',
  'Pixel Lions', 'Omega Team', 'Hyper Nova', 'Rival X', 'Prime Arena', 'Neon Falcons', 'Digital Knights', 'Phoenix Play',
  'Echo Squad', 'Storm Unit', 'Infinity E-Sports', 'Alpha Circuit', 'Night Owls', 'Solar Gaming',
];
const demoCrests = ['falcon', 'crown', 'union', 'comet', 'summit', 'thunder', 'orbit', 'tide'];
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const initials = (name) => name.split(/\s+/).filter((word) => !['FC', 'SC', 'E-SPORTS'].includes(word)).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
const readable = (date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date));
let official = null;
let state = null;

function demoTeams(size, sport) {
  const esports = sport === 'E-sports';
  return Array.from({ length: size }, (_, index) => ({
    id: `demo-${index + 1}`,
    name: (esports ? esportsNames : demoNames)[index],
    crest: esports ? ESPORTS_TEAMS[index]?.demoAsset || null : index < demoCrests.length ? `/assets/demo-crests/${demoCrests[index]}.svg` : null,
    color: ['#2786c7', '#7698b0', '#425d90', '#2685a4', '#637fa6', '#5a94a9'][index % 6],
  }));
}

function crest(team) {
  return team.crest
    ? `<span class="team-crest"><img src="${escape(team.crest)}" alt="Escudo de ${escape(team.name)}" loading="lazy"></span>`
    : `<span class="team-crest team-crest-placeholder" style="--team-color:${escape(team.color || '#2888c6')}" aria-label="Escudo demonstrativo de ${escape(team.name)}">${escape(initials(team.name))}</span>`;
}

function teamTile(team) { return `<li class="team-tile">${crest(team)}<strong>${escape(team.name)}</strong></li>`; }

function currentConfig() {
  const fields = new FormData(form);
  const size = Number(fields.get('count'));
  if (!Number.isInteger(size) || size < 2 || size > 32) throw new Error('Informe entre 2 e 32 participantes.');
  if (official && size !== official.teams.length) throw new Error('A quantidade precisa corresponder às equipes cadastradas na temporada.');
  const format = String(fields.get('format'));
  const stations = fields.get('stations') === '' ? null : Number(fields.get('stations'));
  return {
    sport: sportInput.value, size, format,
    groupSize: String(fields.get('groupSize')), legs: Number(fields.get('legs')),
    allowByes: fields.has('allowByes'), stations,
    start: String(fields.get('start') || ''), duration: Number(fields.get('duration')), interval: Number(fields.get('interval')),
  };
}

function groupSizes(size, format, requested) {
  const knockout = format === 'groups_knockout';
  if (requested !== 'auto') {
    const perGroup = Number(requested);
    if (size % perGroup || knockout && (size / perGroup < 2 || perGroup < 3 || !Number.isInteger(Math.log2(size / perGroup * 2)))) {
      throw new Error(`Não é possível distribuir ${size} equipes em grupos iguais de ${perGroup} neste formato. Use a divisão automática.`);
    }
    return Array(size / perGroup).fill(perGroup);
  }
  if (knockout && size < 6) throw new Error('Para combinar grupos e mata-mata, são necessárias pelo menos 6 equipes. Escolha outro formato para esta quantidade.');
  const candidates = Array.from({ length: Math.floor(size / (knockout ? 3 : 2)) }, (_, index) => index + 1)
    .filter((count) => !knockout || count >= 2 && Number.isInteger(Math.log2(count * 2)))
    .map((count) => {
      const base = Math.floor(size / count);
      const extra = size % count;
      return { count, sizes: Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0)), score: Math.abs(size / count - 4) };
    })
    .filter(({ sizes }) => sizes.every((groupSize) => groupSize >= (knockout ? 3 : 2) && groupSize <= 6))
    .sort((left, right) => left.score - right.score || left.count - right.count);
  if (!candidates.length) throw new Error('Não há uma divisão equilibrada de grupos para essa quantidade de equipes. Escolha outro formato ou ajuste a quantidade.');
  return candidates[0].sizes;
}

function makeStructure(participants, config) {
  const { format, size } = config;
  if (format === 'corujao') {
    if (config.sport !== 'E-sports') throw new Error('O Corujão está disponível somente para e-Sports.');
    const advice = recommendCorujao(size, { stations: config.stations, matchMinutes: config.duration, intervalMinutes: config.interval });
    if (!advice.groupSizes) throw new Error(advice.reason || 'Não há formato de Corujão aprovado para essa quantidade de equipes.');
    if (advice.synchronized === false) throw new Error(`Para ${size} equipes, informe pelo menos ${advice.matchesPerRound} estações em Configurações avançadas para começar todos os jogos da rodada juntos.`);
    const plan = corujaoPlan(participants, { stations: config.stations, matchMinutes: config.duration, intervalMinutes: config.interval });
    return { groups: plan.groups, fixtures: plan.fixtures, summary: `${plan.groups.length} grupos · 3 rodadas · ${plan.fixtures.length} jogos`, note: 'Cada equipe joga uma vez por rodada. Nenhuma fica de folga.', advice };
  }
  if (format === 'groups' || format === 'groups_knockout') {
    const sizes = groupSizes(size, format, config.groupSize);
    let offset = 0;
    const groups = sizes.map((groupSize, index) => ({ id: `group-${index + 1}`, name: `Grupo ${String.fromCharCode(65 + index)}`, teams: participants.slice(offset, offset += groupSize) }));
    const plan = groupPlan(groups, { legs: config.legs, requireChampionRule: false });
    return { groups, fixtures: plan.fixtures, summary: `${groups.length} grupos · ${plan.rounds} rodadas · ${plan.matchCount} jogos`, note: format === 'groups_knockout' ? `Dois por grupo formarão o mata-mata após os resultados serem confirmados.` : 'A fase de grupos é independente. Defina como escolher o campeão geral, se necessário.' };
  }
  if (format === 'round_robin') {
    const plan = roundRobinPlan(participants, config.legs);
    return { groups: [], fixtures: plan.fixtures, summary: `${plan.rounds} rodadas · ${plan.matchCount} jogos`, note: plan.byesPerRound ? 'Uma equipe terá folga por rodada, conforme o formato de pontos corridos.' : 'Todos se enfrentam sem folgas nesta configuração.' };
  }
  if (format === 'knockout') {
    const plan = knockoutPlan(participants, { allowByes: config.allowByes });
    const first = plan.preliminary.length ? plan.preliminary : plan.rounds[0].matches.map((match) => ({ ...match, homeId: match.home.teamId, awayId: match.away.teamId }));
    return { groups: [], fixtures: first, knockout: plan, summary: `${plan.matchCount} jogos · início em ${plan.preliminary.length ? 'preliminar' : plan.rounds[0].name.toLowerCase()}`, note: plan.preliminary.length ? `${plan.directAdvances} equipes avançam diretamente. A ordem sorteada define essa vantagem.` : 'Os vencedores avançam após resultados confirmados.' };
  }
  throw new Error('Escolha um formato de campeonato.');
}

function randomIndex(size) {
  const range = 0x100000000;
  const limit = Math.floor(range / size) * size;
  let value;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return value % size;
}

function shuffleTeams(input) {
  const shuffled = [...input];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled.every((team, index) => team.id === input[index].id)) [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  return shuffled;
}

function fixtureCard(match, byId) {
  const home = byId.get(match.homeId);
  const away = byId.get(match.awayId);
  if (!home || !away) return '';
  return `<article class="fixture-card"><span class="fixture-side">${crest(home)}<strong>${escape(home.name)}</strong></span><span class="fixture-vs">VS</span><span class="fixture-side fixture-away">${crest(away)}<strong>${escape(away.name)}</strong></span></article>`;
}

function renderFixtures() {
  if (!state.generated) return '';
  const byId = new Map(state.participants.map((team) => [team.id, team]));
  const fixtures = state.structure.fixtures;
  const rounds = [...new Set(fixtures.map((match) => match.round || 1))].sort((a, b) => a - b);
  const visible = state.showAll ? rounds : rounds.slice(0, 3);
  const schedule = state.config.format === 'corujao' && state.config.start && state.config.stations
    ? scheduleFixtures(fixtures, { startAt: new Date(state.config.start).toISOString(), matchMinutes: state.config.duration, intervalMinutes: state.config.interval, stations: state.config.stations, synchronizedRounds: true }) : null;
  const dates = new Map(schedule?.fixtures.map((match) => [match.id, match.scheduledAt]) || []);
  return `<section class="fixture-section"><div class="section-head"><span>04 / CONFRONTOS</span><h3>Rodadas geradas</h3><p>${fixtures.length} confrontos prontos para revisão.</p></div>${visible.map((round) => {
    const matches = fixtures.filter((match) => (match.round || 1) === round);
    return `<div class="round-block"><div class="round-head"><strong>${state.config.format === 'knockout' ? state.structure.knockout.preliminary.length ? 'Preliminar' : state.structure.knockout.rounds[0].name : `Rodada ${String(round).padStart(2, '0')}`}</strong><span>${matches.length} partidas${dates.size ? ` · ${escape(readable(dates.get(matches[0].id)))}` : ''}</span></div><div class="fixture-grid">${matches.map((match) => fixtureCard(match, byId)).join('')}</div></div>`;
  }).join('')}${rounds.length > 3 && !state.showAll ? `<button class="text-button" type="button" data-action="show-all">Ver todas as ${rounds.length} rodadas →</button>` : ''}${state.config.format === 'groups_knockout' ? '<p class="fixture-note">O chaveamento receberá os classificados após a confirmação dos resultados da fase de grupos.</p>' : state.config.format === 'knockout' ? '<p class="fixture-note">As fases seguintes mostram referências aos vencedores; nenhum classificado foi inventado.</p>' : ''}</section>`;
}

function renderStructure() {
  const { participants, config, structure } = state;
  const groups = structure.groups.length ? structure.groups : [{ id: 'participants', name: config.format === 'knockout' ? 'Ordem de entrada' : 'Participantes', teams: participants }];
  layout.classList.add('has-plan');
  result.className = '';
  result.innerHTML = `<div class="stage-head"><span class="planner-kicker">${official ? 'EQUIPES DA TEMPORADA' : 'DEMONSTRAÇÃO · EQUIPES FICTÍCIAS'}</span><h2>${escape(formatNames[config.format])}</h2><p>${escape(structure.summary)}</p></div><div class="stage-note">${escape(structure.note)}</div><div class="group-grid ${structure.groups.length ? '' : 'single-group'}">${groups.map((group) => `<article class="group-card"><div class="group-head"><span>${escape(group.name)}</span><b>${group.teams.length} equipes</b></div><ul>${group.teams.map(teamTile).join('')}</ul></article>`).join('')}</div><div class="stage-actions"><button class="draw-button" type="button" data-action="draw">🎲 ${state.draws ? 'REFAZER SORTEIO' : 'SORTEAR EQUIPES'}</button>${state.confirmed ? '<span class="confirmed-mark">✓ Distribuição confirmada</span>' : '<button class="secondary-button" type="button" data-action="confirm">CONFIRMAR GRUPOS</button>'}${state.confirmed && !state.generated ? '<button class="primary-button" type="button" data-action="generate">GERAR CONFRONTOS →</button>' : ''}</div>${state.generated ? renderFixtures() : ''}<p class="preview-disclosure">${official ? 'Prévia com equipes cadastradas. A confirmação e os confrontos desta tela não são gravados no banco.' : 'Demonstração fictícia. Nenhum dado é salvo no banco.'}</p>`;
}

function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
function initialState() {
  state = null;
  layout.classList.remove('has-plan');
  result.className = 'initial-state';
  result.innerHTML = '<div class="field-atmosphere" aria-hidden="true"><div class="field-surface"><span class="field-midline"></span><span class="field-circle"></span><span class="field-spot"></span><span class="field-box field-box-left"></span><span class="field-box field-box-right"></span><span class="field-goal field-goal-left"></span><span class="field-goal field-goal-right"></span></div></div><span class="field-caption">O palco está pronto para o seu campeonato.</span>';
  clearError();
}

function updateFormatOptions() {
  const corujao = formatInput.querySelector('option[value="corujao"]');
  if (sportInput.value === 'E-sports' && !corujao) formatInput.insertAdjacentHTML('beforeend', '<option value="corujao">Corujão</option>');
  if (sportInput.value !== 'E-sports' && corujao) { corujao.remove(); if (formatInput.value === 'corujao') formatInput.value = 'groups_knockout'; }
  const selected = formatInput.value;
  advanced.querySelectorAll('[data-for]').forEach((label) => {
    label.hidden = !(label.dataset.for === selected || label.dataset.for === 'groups' && ['groups', 'groups_knockout'].includes(selected) || label.dataset.for === 'legs' && ['round_robin', 'groups', 'groups_knockout'].includes(selected));
  });
  initialState();
}

form.addEventListener('submit', (event) => {
  event.preventDefault(); clearError();
  try {
    const config = currentConfig();
    const participants = official ? official.teams : demoTeams(config.size, config.sport);
    if (participants.length !== config.size) throw new Error('Cadastre as equipes antes de montar o campeonato.');
    const structure = makeStructure(participants, config);
    state = { config, participants, structure, draws: 0, confirmed: false, generated: false, showAll: false };
    renderStructure();
  } catch (error) { showError(error.message); }
});

result.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !state) return;
  try {
    if (button.dataset.action === 'draw') {
      const participants = shuffleTeams(state.participants);
      state = { ...state, participants, structure: makeStructure(participants, state.config), draws: state.draws + 1, confirmed: false, generated: false, showAll: false };
    } else if (button.dataset.action === 'confirm') state.confirmed = true;
    else if (button.dataset.action === 'generate') { if (!state.confirmed) return; state.generated = true; }
    else if (button.dataset.action === 'show-all') state.showAll = true;
    renderStructure();
  } catch (error) { showError(error.message); }
});

sportInput.addEventListener('change', updateFormatOptions);
formatInput.addEventListener('change', updateFormatOptions);
countInput.addEventListener('input', initialState);
advanced.addEventListener('change', initialState);
updateFormatOptions();

const seasonId = new URLSearchParams(location.search).get('temporada');
if (seasonId) {
  form.querySelector('.primary-button').disabled = true;
  result.innerHTML = '<span class="planner-kicker">EQUIPES CADASTRADAS</span><h2>Carregando temporada…</h2>';
  try {
    const [{ supabaseConfig }, { loadOfficialPlannerEntries }] = await Promise.all([import('./runtime-config.mjs'), import('./planner-official.js')]);
    official = await loadOfficialPlannerEntries(seasonId, supabaseConfig);
    sportInput.value = official.competition.sport;
    sportInput.disabled = true;
    countInput.value = String(official.teams.length);
    countInput.readOnly = true;
    if (['round_robin', 'knockout', 'groups_knockout'].includes(official.season.format)) formatInput.value = official.season.format;
    updateFormatOptions();
    result.innerHTML = `<span class="planner-kicker">${escape(official.competition.name)} · ${escape(official.season.label)}</span><h2>${official.teams.length} equipes cadastradas.</h2><p>Monte a estrutura com os participantes oficiais desta temporada.</p>`;
    form.querySelector('.primary-button').disabled = false;
  } catch (error) {
    result.innerHTML = `<span class="planner-kicker">TEMPORADA INDISPONÍVEL</span><h2>Não foi possível carregar as equipes.</h2><p>${escape(error.message)}</p><a class="secondary-button" href="/entrar?retorno=%2Fpainel">Abrir painel</a>`;
  }
}

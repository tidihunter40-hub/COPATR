import { corujaoPlan, groupPlan, knockoutPlan, recommendCorujao, roundRobinPlan, scheduleFixtures } from './tr-competition-engine.mjs';

const form = document.querySelector('#planner-form');
const sport = document.querySelector('#planner-sport');
const count = document.querySelector('#planner-count');
const format = document.querySelector('#planner-format');
const options = document.querySelector('#planner-options');
const result = document.querySelector('#plan-result');
const title = document.querySelector('#plan-title');
const teams = (number) => Array.from({ length: number }, (_, index) => ({ id: `team-${index + 1}`, name: `Equipe ${String(index + 1).padStart(2, '0')}` }));
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const metric = (label, value) => `<div class="plan-metric"><strong>${escape(value)}</strong><span>${escape(label)}</span></div>`;
const list = (items) => `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>`;
const fixturePreview = (fixtures, participants) => {
  const names = new Map(participants.map((team) => [team.id, team.name]));
  const first = fixtures.filter((match) => match.round === 1);
  return `<details class="plan-preview"><summary>Ver confrontos da 1ª rodada (${first.length})</summary><div>${first.map((match) => `<p><span>${escape(names.get(match.homeId))}</span><b>×</b><span>${escape(names.get(match.awayId))}</span></p>`).join('')}</div></details>`;
};
const groupsPreview = (groups) => `<details class="plan-preview"><summary>Ver distribuição dos grupos</summary><div>${groups.map((group) => `<p><strong>${escape(group.name || group.id)}</strong><span>${escape(group.teams.map((team) => team.name).join(' · '))}</span></p>`).join('')}</div></details>`;
const alternatives = (size, sportName, selected) => {
  if (!Number.isInteger(size) || size < 2 || size > 32) return '';
  const available = [
    { id: 'round_robin', label: 'Pontos corridos', state: 'Válido', detail: `${size * (size - 1) / 2} partidas em turno único` },
    ...(size >= 8 && size % 4 === 0 ? [{ id: 'groups_knockout', label: 'Grupos + mata-mata', state: Number.isInteger(Math.log2(size / 2)) ? 'Viável' : 'Exige critérios', detail: `${size / 4} grupos de quatro` }] : []),
    { id: 'knockout', label: 'Mata-mata direto', state: Number.isInteger(Math.log2(size)) ? 'Viável' : 'Exige preliminar', detail: `${size - 1} partidas no total` },
    ...(sportName === 'E-sports' ? [{ id: 'corujao', label: 'Corujão', state: recommendCorujao(size).groupSizes ? 'Analisar regras' : 'Sem preset aprovado', detail: 'Três rodadas sem folgas' }] : []),
  ].filter((item) => item.id !== selected).slice(0, 3);
  return `<div class="plan-alternatives"><h3>Outras opções para ${size} equipes</h3>${available.map((item) => `<button type="button" data-format="${item.id}"><strong>${escape(item.label)}</strong><span>${escape(item.detail)}</span><small>${escape(item.state)}</small></button>`).join('')}</div>`;
};

function updateOptions() {
  const current = format.value;
  const corujao = format.querySelector('option[value="corujao"]');
  if (sport.value === 'E-sports' && !corujao) format.insertAdjacentHTML('beforeend', '<option value="corujao">Corujão · e-Sports</option>');
  if (sport.value !== 'E-sports' && corujao) { corujao.remove(); if (current === 'corujao') format.value = 'round_robin'; }
  const selected = format.value;
  options.innerHTML = selected === 'round_robin' ? '<label>Turnos<select name="legs"><option value="1">Turno único</option><option value="2">Turno e returno</option><option value="3">Três turnos</option><option value="4">Quatro turnos</option></select></label>'
    : selected === 'groups' || selected === 'groups_knockout' ? '<label>Equipes por grupo<select name="groupSize"><option value="4">4 equipes</option><option value="3">3 equipes</option><option value="5">5 equipes</option></select></label><label>Turnos da fase de grupos<select name="legs"><option value="1">Somente ida</option><option value="2">Ida e volta</option></select></label>'
    : selected === 'corujao' ? '<label>Estações simultâneas<input name="stations" type="number" min="1" max="32" value="10"></label><label>Data e horário de início (opcional)<input name="start" type="datetime-local"></label><label>Minutos por partida<input name="duration" type="number" min="1" max="300" value="20"></label><label>Intervalo entre rodadas (min)<input name="interval" type="number" min="0" max="120" value="10"></label>' : '';
  render();
}

function render() {
  const size = Number(count.value);
  const chosen = format.value;
  const fields = new FormData(form);
  const participants = teams(size);
  const labels = { round_robin: 'Pontos corridos', groups: 'Fase de grupos', groups_knockout: 'Grupos + mata-mata', knockout: 'Mata-mata direto', corujao: 'Corujão' };
  title.textContent = labels[chosen];
  try {
    if (!Number.isInteger(size) || size < 2 || size > 32) throw new Error('Informe entre 2 e 32 participantes.');
    if (chosen === 'round_robin') {
      const plan = roundRobinPlan(participants, Number(fields.get('legs')));
      result.innerHTML = `<span class="plan-status good">FORMATO MATEMATICAMENTE VÁLIDO</span><div class="plan-metrics">${metric('Partidas', plan.matchCount)}${metric('Rodadas', plan.rounds)}${metric('Por rodada', plan.matchesPerRound)}${metric('Folgas por rodada', plan.byesPerRound)}</div><p>O método circular distribui todos os confrontos. ${plan.byesPerRound ? 'Com participantes ímpares, há uma folga por rodada.' : 'Cada equipe joga uma vez por rodada.'}</p>${fixturePreview(plan.fixtures, participants)}${list(['Resultados e classificação devem seguir o regulamento da modalidade.', 'A geração oficial depende de participantes cadastrados na temporada.'])}`;
    } else if (chosen === 'groups' || chosen === 'groups_knockout') {
      const groupSize = Number(fields.get('groupSize'));
      if (size % groupSize) throw new Error(`${size} participantes não podem ser divididos igualmente em grupos de ${groupSize}. Escolha outro tamanho ou defina uma distribuição manual.`);
      const groups = Array.from({ length: size / groupSize }, (_, index) => ({ id: `G${index + 1}`, teams: participants.slice(index * groupSize, (index + 1) * groupSize) }));
      const plan = groupPlan(groups, { legs: Number(fields.get('legs')), requireChampionRule: false });
      const qualified = groups.length * 2;
      const powerOfTwo = Number.isInteger(Math.log2(qualified));
      result.innerHTML = `<span class="plan-status ${chosen === 'groups' || !powerOfTwo ? 'attention' : 'good'}">${chosen === 'groups' || !powerOfTwo ? 'REGULAMENTO ADICIONAL NECESSÁRIO' : 'CALENDÁRIO MATEMATICAMENTE VÁLIDO'}</span><div class="plan-metrics">${metric('Grupos', groups.length)}${metric('Partidas da fase', plan.matchCount)}${metric('Rodadas', plan.rounds)}${metric('Equipes por grupo', groupSize)}</div><p>${chosen === 'groups' ? 'Se a competição terminar nos grupos, defina como será escolhido o campeão geral.' : powerOfTwo ? `Dois por grupo geram ${qualified} classificados e início em ${knockoutPlan(teams(qualified)).rounds[0].name.toLowerCase()}.` : `Dois por grupo geram ${qualified} classificados; é preciso definir vagas adicionais ou preliminares de forma explícita.`}</p>${groupsPreview(groups)}${fixturePreview(plan.fixtures, participants)}${list(['A distribuição real das equipes e os critérios de desempate precisam constar no regulamento.', 'A criação oficial de grupos e progressão ainda exige integração de fases no banco.'])}`;
    } else if (chosen === 'knockout') {
      const plan = knockoutPlan(participants, { allowByes: true });
      result.innerHTML = `<span class="plan-status ${plan.preliminary.length ? 'attention' : 'good'}">${plan.preliminary.length ? 'PRELIMINAR E AVANÇOS EXPLÍCITOS' : 'CHAVE DIRETA VÁLIDA'}</span><div class="plan-metrics">${metric('Partidas', plan.matchCount)}${metric('Fase inicial', plan.rounds[0].name)}${metric('Preliminares', plan.preliminary.length)}${metric('Avanços diretos', plan.directAdvances)}</div><p>${plan.preliminary.length ? `${plan.directAdvances} equipes entram diretamente na fase principal; ${plan.preliminary.length * 2} disputam a preliminar. Essa escolha precisa ser confirmada pelo organizador.` : 'Todos entram na primeira fase sem folgas.'}</p>${list(['Empates exigem desempate configurado; o motor não inventa classificados.', 'A progressão oficial de fases ainda depende de integração de dados.'])}`;
    } else {
      const stations = Number(fields.get('stations'));
      const advice = recommendCorujao(size, { stations, matchMinutes: Number(fields.get('duration')), intervalMinutes: Number(fields.get('interval')) });
      if (!advice.groupSizes) { result.innerHTML = `<span class="plan-status ${advice.status === 'incompatible' ? 'invalid' : 'attention'}">${advice.status === 'incompatible' ? 'INCOMPATÍVEL' : 'EXIGE DEFINIÇÃO ESPORTIVA'}</span><p>${escape(advice.reason)}</p>`; return; }
      const plan = corujaoPlan(participants, { stations, matchMinutes: Number(fields.get('duration')), intervalMinutes: Number(fields.get('interval')) });
      const start = String(fields.get('start') || '');
      const schedule = start && advice.synchronized ? scheduleFixtures(plan.fixtures, { startAt: new Date(start).toISOString(), matchMinutes: Number(fields.get('duration')), intervalMinutes: Number(fields.get('interval')), stations, synchronizedRounds: true }) : null;
      const scheduleText = schedule ? `<p>Primeira rodada: ${escape(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(schedule.fixtures[0].scheduledAt)))}. Fim previsto da primeira fase: ${escape(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(schedule.endsAt)))}.</p>` : '<p>Escolha o horário de início e informe estações suficientes para calcular a agenda sincronizada.</p>';
      result.innerHTML = `<span class="plan-status ${advice.status === 'recommended' ? 'good' : advice.status === 'incompatible' ? 'invalid' : 'attention'}">${advice.status === 'recommended' ? 'AGENDA RECOMENDADA' : advice.status === 'incompatible' ? 'INFRAESTRUTURA INCOMPATÍVEL' : 'AGENDA VÁLIDA COM RESSALVAS'}</span><div class="plan-metrics">${metric('Grupos', plan.groups.length)}${metric('Primeira fase', advice.groupMatches)}${metric('Por rodada', advice.matchesPerRound)}${metric('Classificados', advice.advances)}${metric('Total previsto', advice.totalMatches)}${metric('Mata-mata', advice.knockoutStart)}</div><p>${escape(advice.groupSizes.join(' + '))} equipes por grupo. Cada participante joga uma vez em cada uma das três rodadas.${advice.estimatedMinutes === null ? '' : advice.synchronized === false ? ` Com a capacidade informada seriam necessárias ${advice.waves} ondas por rodada e cerca de ${Math.ceil(advice.estimatedMinutes / 60)} hora(s), o que não atende à simultaneidade do Corujão.` : ` Duração estimada: ${Math.ceil(advice.estimatedMinutes / 60)} hora(s), condicionada à capacidade informada.`}</p>${scheduleText}${groupsPreview(plan.groups)}${fixturePreview(plan.fixtures, participants)}${list([...advice.warnings, 'Critérios de desempate devem ser definidos pelo organizador.', 'Corujão oficial ainda não pode ser criado até a integração de fases e classificação no banco.'])}`;
    }
  } catch (error) { result.innerHTML = `<span class="plan-status invalid">CONFIGURAÇÃO INCOMPATÍVEL</span><p>${escape(error.message)}</p>`; }
  finally { result.insertAdjacentHTML('beforeend', alternatives(size, sport.value, chosen)); }
}

sport.addEventListener('change', updateOptions);
format.addEventListener('change', updateOptions);
form.addEventListener('input', render);
form.addEventListener('change', render);
form.addEventListener('submit', (event) => event.preventDefault());
result.addEventListener('click', (event) => { const button = event.target.closest('button[data-format]'); if (button) { format.value = button.dataset.format; updateOptions(); } });
updateOptions();

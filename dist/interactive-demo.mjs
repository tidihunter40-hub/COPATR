import { ESPORTS_DEMO } from './esports-demo.mjs';
import { calculateStandings } from './engine.mjs';
import { demoDateForRound, getInteractiveFixtures, hasInteractiveResult, resetInteractiveResults, saveInteractiveResult, undoInteractiveResult } from './interactive-demo-state.mjs';

const teams = new Map(ESPORTS_DEMO.teams.map((team) => [team.id, team]));
const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const crest = (team, className = '') => `<img class="${className}" src="${escape(team.demoAsset)}" alt="Escudo de ${escape(team.name)}" loading="lazy">`;
const dateLabel = (round) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(demoDateForRound(round));
const scoreLabel = (score) => score > 0 ? `+${score}` : String(score);
let activeMatchId = null;
let expandedTeamId = null;

$('#team-strip').innerHTML = ESPORTS_DEMO.teams.map((team) => `<div class="strip-team" title="${escape(team.name)}">${crest(team)}<span>${escape(team.name)}</span></div>`).join('');

function matchCard(fixture) {
  const home = teams.get(fixture.homeId);
  const away = teams.get(fixture.awayId);
  const complete = fixture.homeScore !== null;
  return `<article class="match-card ${complete ? 'match-complete' : ''}" data-fixture-id="${escape(fixture.id)}">
    <div class="match-meta"><span class="match-round">RODADA ${String(fixture.round).padStart(2, '0')}</span><span class="match-state">${complete ? 'PLACAR SIMULADO' : 'A DISPUTAR'}</span></div>
    <div class="match-teams">
      <div class="match-team"><span class="crest-frame">${crest(home)}</span><span class="team-side">MANDANTE</span><strong>${escape(home.name)}</strong></div>
      <div class="match-score" aria-label="${complete ? `Placar ${fixture.homeScore} a ${fixture.awayScore}` : 'Versus'}">${complete ? `<b>${fixture.homeScore}</b><span>×</span><b>${fixture.awayScore}</b>` : '<span>VS</span>'}</div>
      <div class="match-team"><span class="crest-frame">${crest(away)}</span><span class="team-side">VISITANTE</span><strong>${escape(away.name)}</strong></div>
    </div>
    <div class="match-footer"><span class="match-date">${dateLabel(fixture.round)}</span>${complete ? `<div class="match-actions"><button type="button" class="edit-result-button" data-match-id="${escape(fixture.id)}">Alterar resultado</button><button type="button" class="undo-result-button" data-undo-match-id="${escape(fixture.id)}">Desfazer</button></div>` : `<button class="simulate-button" type="button" data-match-id="${escape(fixture.id)}">Simular resultado <span aria-hidden="true">→</span></button>`}</div>
  </article>`;
}

function compactResult(fixture) {
  const home = teams.get(fixture.homeId);
  const away = teams.get(fixture.awayId);
  return `<article class="result-row"><div class="result-meta"><span>RODADA ${String(fixture.round).padStart(2, '0')} <span class="result-date">· ${dateLabel(fixture.round)}</span></span>${hasInteractiveResult(fixture.id) ? '<span class="simulated-tag">SIMULADO</span>' : '<span class="result-final">RESULTADO FINAL</span>'}</div><div class="result-main"><div class="result-team"><span class="result-crest">${crest(home)}</span><span class="result-name">${escape(home.name)}</span></div><strong class="result-score" aria-label="Placar ${fixture.homeScore} a ${fixture.awayScore}"><span>${fixture.homeScore}</span><i>×</i><span>${fixture.awayScore}</span></strong><div class="result-team result-away"><span class="result-crest">${crest(away)}</span><span class="result-name">${escape(away.name)}</span></div></div></article>`;
}

function standingRow(row, index) {
  const team = teams.get(row.id);
  const expanded = row.id === expandedTeamId;
  return `<div class="standing-item ${index === 0 ? 'leader' : index === 1 ? 'runner-up' : ''}"><button type="button" class="standings-row" data-team-id="${escape(row.id)}" aria-expanded="${expanded}">
    <span class="standing-team"><b class="place">${index + 1}</b>${crest(team)}<span class="standing-name">${escape(row.name)}${index === 0 ? '<small>LÍDER</small>' : ''}</span></span>
    <strong class="stat-points">${row.points}</strong><span>${row.played}</span><span class="secondary-stat">${row.wins}</span><span class="secondary-stat">${row.draws}</span><span class="secondary-stat">${row.losses}</span><strong class="stat-goal-diff">${scoreLabel(row.goalDifference)}</strong>
  </button><div class="standing-detail" ${expanded ? '' : 'hidden'}><span>Vitórias <strong>${row.wins}</strong></span><span>Empates <strong>${row.draws}</strong></span><span>Derrotas <strong>${row.losses}</strong></span><span>Gols pró <strong>${row.goalsFor}</strong></span><span>Gols contra <strong>${row.goalsAgainst}</strong></span><span>Aproveitamento <strong>${row.performance}%</strong></span></div></div>`;
}

function render() {
  const fixtures = getInteractiveFixtures();
  const nextRound = fixtures.filter((fixture) => fixture.round === 2);
  const recent = fixtures.filter((fixture) => fixture.homeScore !== null).sort((a, b) => b.round - a.round);
  $('#upcoming-matches').innerHTML = nextRound.map(matchCard).join('');
  $('#recent-matches').innerHTML = recent.map(compactResult).join('');
  $('#standings-rows').innerHTML = calculateStandings(ESPORTS_DEMO.teams, fixtures).map(standingRow).join('');
}

function explain(title, message) {
  $('#demo-explain').innerHTML = `<span class="explain-icon" aria-hidden="true">✓</span><div><strong>${title}</strong><p>${message}</p></div>`;
  $('#demo-explain').classList.add('is-success');
  const panel = $('.standings-panel');
  panel.classList.remove('is-updating');
  void panel.offsetWidth;
  panel.classList.add('is-updating');
  setTimeout(() => panel.classList.remove('is-updating'), 850);
}

function openScoreDialog(id) {
  const fixture = getInteractiveFixtures().find((match) => match.id === id);
  if (!fixture || !ESPORTS_DEMO.fixtures.some((match) => match.id === id && match.homeScore === null)) return;
  activeMatchId = id;
  const home = teams.get(fixture.homeId);
  const away = teams.get(fixture.awayId);
  $('#dialog-teams').innerHTML = `<div>${crest(home)}<strong>${escape(home.name)}</strong></div><span>VS</span><div>${crest(away)}<strong>${escape(away.name)}</strong></div>`;
  $('#home-label').textContent = home.name;
  $('#away-label').textContent = away.name;
  $('#score-form').reset();
  $('#dialog-heading').textContent = hasInteractiveResult(id) ? 'Alterar resultado' : 'Simular resultado';
  $('#home-score').value = fixture.homeScore ?? '';
  $('#away-score').value = fixture.awayScore ?? '';
  $('#form-error').textContent = '';
  $('#score-dialog').showModal();
  $('#home-score').focus();
}

$('#upcoming-matches').addEventListener('click', (event) => {
  const undoButton = event.target.closest('button[data-undo-match-id]');
  if (undoButton) {
    undoInteractiveResult(undoButton.dataset.undoMatchId);
    render();
    explain('Resultado desfeito', 'A partida voltou a ficar sem placar e a classificação foi recalculada.');
    $('#upcoming-matches').querySelector(`[data-fixture-id="${undoButton.dataset.undoMatchId}"] .simulate-button`)?.focus();
    return;
  }
  const button = event.target.closest('button[data-match-id]');
  if (button) openScoreDialog(button.dataset.matchId);
});
$('#standings-rows').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-team-id]');
  if (!button) return;
  expandedTeamId = expandedTeamId === button.dataset.teamId ? null : button.dataset.teamId;
  render();
  $('#standings-rows').querySelector(`[data-team-id="${button.dataset.teamId}"]`)?.focus();
});
$('#score-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    saveInteractiveResult(activeMatchId, $('#home-score').value, $('#away-score').value);
    $('#score-dialog').close();
    activeMatchId = null;
    render();
    explain('Classificação atualizada!', 'É assim que você administra seus campeonatos na TR Campeonatos.');
  } catch (error) { $('#form-error').textContent = error.message; }
});
for (const selector of ['#close-dialog', '#cancel-dialog']) $(selector).addEventListener('click', () => $('#score-dialog').close());
$('#score-dialog').addEventListener('close', () => { activeMatchId = null; });
$('#reset-demo').addEventListener('click', () => {
  resetInteractiveResults();
  expandedTeamId = null;
  render();
  $('#demo-explain').innerHTML = '<span class="explain-icon" aria-hidden="true">✦</span><div><strong>Demonstração reiniciada</strong><p>Escolha um confronto e simule um novo resultado.</p></div>';
  $('#demo-explain').classList.remove('is-success');
  $('#demo-explain').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

render();

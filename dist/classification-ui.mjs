const teams = [
  { id: 'falcoes', name: 'Falcões FC', crest: 'eagle', motto: 'TRADIÇÃO EM CADA JOGO' },
  { id: 'real', name: 'Real Sports', crest: 'real', motto: 'COMPETIÇÃO EM ALTO NÍVEL' },
  { id: 'uniao', name: 'União FC', crest: 'union', motto: 'FORÇA QUE UNE O CAMPO' },
  { id: 'atletico', name: 'Atlético RS', crest: 'atletico', motto: 'RAÇA EM CADA DISPUTA' },
  { id: 'vila', name: 'Vila Operária', crest: 'vila', motto: 'O CLUBE DA COMUNIDADE' },
  { id: 'pombal', name: 'Pombal City', crest: 'pombal', motto: 'VOANDO MAIS ALTO' },
];

const results = [
  ['falcoes', 'real', 1, 1], ['falcoes', 'uniao', 3, 0], ['falcoes', 'atletico', 3, 0], ['falcoes', 'vila', 2, 1], ['falcoes', 'pombal', 3, 1],
  ['real', 'uniao', 2, 1], ['real', 'atletico', 3, 1], ['real', 'vila', 3, 0], ['real', 'pombal', 0, 1],
  ['uniao', 'atletico', 2, 1], ['uniao', 'vila', 2, 1], ['uniao', 'pombal', 2, 1],
  ['atletico', 'vila', 1, 0], ['atletico', 'pombal', 1, 1], ['vila', 'pombal', 1, 2],
];

const byId = new Map(teams.map((team) => [team.id, team]));
const crest = (team, big = false) => `<span class="tr-crest ${team.crest}${big ? ' big' : ''}" aria-hidden="true">${team.name[0]}</span>`;

function standingData() {
  const rows = new Map(teams.map((team) => [team.id, { ...team, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, form: [], games: [] }]));
  for (const [home, away, homeScore, awayScore] of results) {
    const h = rows.get(home); const a = rows.get(away);
    h.played++; a.played++; h.goalsFor += homeScore; h.goalsAgainst += awayScore; a.goalsFor += awayScore; a.goalsAgainst += homeScore;
    const hResult = homeScore > awayScore ? 'V' : homeScore === awayScore ? 'E' : 'D';
    const aResult = hResult === 'V' ? 'D' : hResult === 'D' ? 'V' : 'E';
    if (hResult === 'V') h.wins++; else if (hResult === 'E') h.draws++; else h.losses++;
    if (aResult === 'V') a.wins++; else if (aResult === 'E') a.draws++; else a.losses++;
    h.form.push(hResult); a.form.push(aResult);
    h.games.push({ opponent: a, goalsFor: homeScore, goalsAgainst: awayScore, result: hResult });
    a.games.push({ opponent: h, goalsFor: awayScore, goalsAgainst: homeScore, result: aResult });
  }
  return [...rows.values()].map((row) => ({ ...row, points: row.wins * 3 + row.draws, difference: row.goalsFor - row.goalsAgainst, performance: Math.round(((row.wins * 3 + row.draws) / (row.played * 3)) * 100) || 0 })).sort((a, b) => b.points - a.points || b.wins - a.wins || b.difference - a.difference || b.goalsFor - a.goalsFor);
}

const rows = standingData();
const resultClass = { V: 'win', E: 'draw', D: 'loss' };

function renderTable() {
  const tableBody = document.querySelector('.tr-standings-card tbody');
  if (!tableBody) return;
  tableBody.innerHTML = rows.map((team, index) => `<tr data-team-id="${team.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${team.name}" class="${index === 0 ? 'leader' : ''}"><td><b>${index + 1}</b></td><td>${crest(team)}${team.name}</td><td>${team.points}</td><td>${team.played}</td><td>${team.wins}</td><td>${team.draws}</td><td>${team.losses}</td><td>${team.goalsFor}</td><td>${team.goalsAgainst}</td><td class="${team.difference < 0 ? 'negative' : ''}">${team.difference > 0 ? '+' : ''}${team.difference}</td><td>${team.performance}%</td><td>${team.form.slice(-5).map((result) => `<i class="${resultClass[result]}">${result}</i>`).join('')}</td></tr>`).join('');
  tableBody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => selectTeam(row.dataset.teamId));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTeam(row.dataset.teamId); } });
  });
}

function selectTeam(id) {
  const team = rows.find((item) => item.id === id);
  if (!team) return;
  const position = rows.findIndex((item) => item.id === id) + 1;
  document.querySelectorAll('.tr-standings-card tr').forEach((row) => row.classList.toggle('selected-team', row.dataset.teamId === id));
  const hero = document.querySelector('.tr-team-hero');
  hero.querySelector('.tr-crest.big').outerHTML = crest(team, true);
  hero.querySelector('h3').textContent = team.name.toUpperCase();
  hero.querySelector('p').textContent = team.motto;
  hero.querySelector('div small').innerHTML = `${position}º<br>LUGAR`;
  hero.querySelector('.tr-team-metrics').innerHTML = [[team.points, 'PONTOS'], [team.played, 'JOGOS'], [team.wins, 'VITÓRIAS'], [team.draws, 'EMPATES'], [team.losses, 'DERROTAS'], [team.goalsFor, 'GOLS PRÓ'], [team.goalsAgainst, 'GOLS CONTRA'], [`${team.difference > 0 ? '+' : ''}${team.difference}`, 'SALDO'], [`${team.performance}%`, 'APROVEITAMENTO']].map(([value, label]) => `<b>${value}<small>${label}</small></b>`).join('');
  document.querySelector('.tr-last-games').innerHTML = `<header><span class="tr-panel-icon"></span><b>ÚLTIMOS CONFRONTOS</b></header>${team.games.slice(-5).reverse().map((game) => `<p>${crest(team)} ${team.name} <b>${game.goalsFor} × ${game.goalsAgainst}</b> ${crest(game.opponent)} <i class="${resultClass[game.result]}">${game.result}</i></p>`).join('')}`;
}

renderTable();
selectTeam(rows[0].id);
window.TRClassification = { rows, renderTable, selectTeam };

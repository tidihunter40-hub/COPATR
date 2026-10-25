export const MAX_TEAMS = 32;

export function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function validateTeamName(name, teams, exceptId = null) {
  const clean = normalizeName(name);
  if (clean.length < 2 || clean.length > 50) throw new Error('Use um nome de equipe entre 2 e 50 caracteres.');
  if (teams.some((team) => team.id !== exceptId && normalizeName(team.name).toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'))) {
    throw new Error('Já existe uma equipe com esse nome.');
  }
  return clean;
}

export function generateFixtures(teams, returnLeg = false) {
  if (!Array.isArray(teams) || teams.length < 2 || teams.length > MAX_TEAMS) {
    throw new Error(`Cadastre de 2 a ${MAX_TEAMS} equipes para gerar confrontos.`);
  }
  const ids = teams.map((team) => team.id);
  if (new Set(ids).size !== ids.length) throw new Error('As equipes precisam ser únicas.');
  const ring = ids.length % 2 ? [...ids, null] : [...ids];
  const roundCount = ring.length - 1;
  const firstLeg = [];
  for (let round = 0; round < roundCount; round += 1) {
    for (let pair = 0; pair < ring.length / 2; pair += 1) {
      let homeId = ring[pair];
      let awayId = ring[ring.length - 1 - pair];
      if (homeId === null || awayId === null) continue;
      if (round % 2 === 1) [homeId, awayId] = [awayId, homeId];
      firstLeg.push({ id: `r${round + 1}-${pair + 1}`, round: round + 1, homeId, awayId, homeScore: null, awayScore: null, history: [] });
    }
    ring.splice(1, 0, ring.pop());
  }
  if (!returnLeg) return firstLeg;
  return [...firstLeg, ...firstLeg.map((match) => ({
    ...match,
    id: `r${match.round + roundCount}-${match.id}`,
    round: match.round + roundCount,
    homeId: match.awayId,
    awayId: match.homeId,
    history: [],
  }))];
}

export function validateScore(value) {
  if (value === '' || value === null || value === undefined) throw new Error('Informe os dois placares.');
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 99) throw new Error('O placar deve ser um inteiro entre 0 e 99.');
  return score;
}

export function updateResult(fixtures, matchId, homeValue, awayValue, at = new Date().toISOString()) {
  const homeScore = validateScore(homeValue);
  const awayScore = validateScore(awayValue);
  let found = false;
  const updated = fixtures.map((match) => {
    if (match.id !== matchId) return match;
    found = true;
    if (match.homeScore === homeScore && match.awayScore === awayScore) return match;
    const history = [...(match.history ?? [])];
    if (match.homeScore !== null && match.awayScore !== null) {
      history.push({ homeScore: match.homeScore, awayScore: match.awayScore, changedAt: at });
    }
    return { ...match, homeScore, awayScore, history };
  });
  if (!found) throw new Error('Partida não encontrada.');
  return updated;
}

export function calculateStandings(teams, fixtures) {
  const table = new Map(teams.map((team) => [team.id, {
    id: team.id, name: team.name, points: 0, played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, performance: 0,
  }]));
  for (const match of fixtures) {
    if (match.homeScore === null || match.awayScore === null) continue;
    const home = table.get(match.homeId);
    const away = table.get(match.awayId);
    if (!home || !away) continue;
    const hs = validateScore(match.homeScore);
    const as = validateScore(match.awayScore);
    home.played += 1; away.played += 1;
    home.goalsFor += hs; home.goalsAgainst += as;
    away.goalsFor += as; away.goalsAgainst += hs;
    if (hs > as) { home.wins += 1; home.points += 3; away.losses += 1; }
    else if (hs < as) { away.wins += 1; away.points += 3; home.losses += 1; }
    else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
  }
  return [...table.values()].map((row) => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst,
    performance: row.played ? Math.round(row.points / (row.played * 3) * 100) : 0,
  })).sort((a, b) => b.points - a.points || b.wins - a.wins || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name, 'pt-BR'));
}

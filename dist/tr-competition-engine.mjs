import { generateFixtures, validateScore } from './engine.mjs';

const phaseNames = new Map([[2, 'Final'], [4, 'Semifinais'], [8, 'Quartas de final'], [16, 'Oitavas de final'], [32, 'Dezesseis avos de final'], [64, 'Trinta e dois avos de final']]);
const defaultRules = Object.freeze({ win: 3, draw: 1, loss: 0, tiebreakers: ['points', 'wins', 'goalDifference', 'goalsFor', 'name'] });
const numericCriteria = new Set(['points', 'wins', 'goalDifference', 'goalsFor', 'goalsAgainst', 'headToHeadPoints', 'headToHeadGoalDifference', 'fairPlay']);

export function validateParticipants(teams, { min = 2, max = 64 } = {}) {
  if (!Array.isArray(teams) || teams.length < min || teams.length > max) throw new Error(`Informe de ${min} a ${max} participantes.`);
  const ids = teams.map((team) => String(team?.id || '').trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('Cada participante precisa de um identificador único.');
  const names = teams.map((team) => String(team?.name || '').trim().toLocaleLowerCase('pt-BR'));
  if (names.some((name) => !name) || new Set(names).size !== names.length) throw new Error('Cada participante precisa de um nome único.');
  return teams;
}

export function validateScoringRules(input = defaultRules) {
  const rules = { ...defaultRules, ...input };
  for (const key of ['win', 'draw', 'loss']) if (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] > 100) throw new Error(`Pontuação inválida para ${key}.`);
  if (!Array.isArray(rules.tiebreakers) || !rules.tiebreakers.length || new Set(rules.tiebreakers).size !== rules.tiebreakers.length || rules.tiebreakers.some((key) => !numericCriteria.has(key) && key !== 'name')) throw new Error('Defina critérios de desempate válidos e sem repetição.');
  if (rules.tiebreakers.includes('headToHeadPoints') && !rules.tiebreakers.includes('name')) throw new Error('O confronto direto precisa de um critério final determinístico.');
  return rules;
}

export function roundRobinPlan(teams, legs = 1) {
  validateParticipants(teams, { max: 32 });
  if (!Number.isInteger(legs) || legs < 1 || legs > 4) throw new Error('Use de um a quatro turnos.');
  const base = generateFixtures(teams);
  const roundsPerLeg = teams.length % 2 ? teams.length : teams.length - 1;
  const fixtures = Array.from({ length: legs }, (_, leg) => base.map((match) => ({
    ...match, id: `leg${leg + 1}-${match.id}`, round: match.round + leg * roundsPerLeg,
    homeId: leg % 2 ? match.awayId : match.homeId, awayId: leg % 2 ? match.homeId : match.awayId,
    leg: leg + 1, history: [],
  }))).flat();
  return { format: 'round_robin', teamCount: teams.length, legs, rounds: roundsPerLeg * legs, matchesPerRound: Math.floor(teams.length / 2), byesPerRound: teams.length % 2, matchCount: fixtures.length, fixtures };
}

export function groupPlan(groups, { legs = 1, requireChampionRule = true } = {}) {
  if (!Array.isArray(groups) || !groups.length) throw new Error('Defina ao menos um grupo.');
  const all = groups.flatMap((group) => group.teams || []);
  validateParticipants(all);
  const ids = groups.map((group) => String(group.id || '').trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('Cada grupo precisa de um identificador único.');
  if (groups.some((group) => !Array.isArray(group.teams) || group.teams.length < 2)) throw new Error('Cada grupo precisa de pelo menos duas equipes.');
  if (groups.length > 1 && requireChampionRule) throw new Error('Defina explicitamente como será escolhido o campeão entre os grupos.');
  const plans = groups.map((group) => ({ id: group.id, ...roundRobinPlan(group.teams, legs) }));
  const fixtures = plans.flatMap((plan) => plan.fixtures.map((match) => ({ ...match, id: `${plan.id}-${match.id}`, groupId: plan.id, phase: 'groups' })));
  return { format: 'groups', groups: plans.map(({ id, teamCount, rounds, matchCount }) => ({ id, teamCount, rounds, matchCount })), matchCount: fixtures.length, rounds: Math.max(...plans.map((plan) => plan.rounds)), fixtures };
}

function headToHead(fixtures, ids, rules) {
  const sub = new Map(ids.map((id) => [id, { points: 0, goalDifference: 0 }]));
  for (const match of fixtures) {
    if (!ids.includes(match.homeId) || !ids.includes(match.awayId) || match.homeScore == null || match.awayScore == null) continue;
    const home = sub.get(match.homeId); const away = sub.get(match.awayId);
    const diff = validateScore(match.homeScore) - validateScore(match.awayScore);
    home.goalDifference += diff; away.goalDifference -= diff;
    if (diff > 0) { home.points += rules.win; away.points += rules.loss; }
    else if (diff < 0) { away.points += rules.win; home.points += rules.loss; }
    else { home.points += rules.draw; away.points += rules.draw; }
  }
  return sub;
}

export function standings(teams, fixtures, inputRules = defaultRules, { allowOutsideOpponents = false } = {}) {
  validateParticipants(teams);
  const rules = validateScoringRules(inputRules);
  const rows = new Map(teams.map((team) => [team.id, { id: team.id, name: team.name, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, performance: 0, fairPlay: Number(team.fairPlay ?? 0) }]));
  for (const match of fixtures) {
    if (match.homeScore == null && match.awayScore == null) continue;
    if ((!rows.has(match.homeId) || !rows.has(match.awayId)) && !allowOutsideOpponents || match.homeId === match.awayId) throw new Error('Partida com participante inválido.');
    const homeScore = validateScore(match.homeScore); const awayScore = validateScore(match.awayScore);
    const home = rows.get(match.homeId); const away = rows.get(match.awayId);
    if (home) { home.played++; home.goalsFor += homeScore; home.goalsAgainst += awayScore; }
    if (away) { away.played++; away.goalsFor += awayScore; away.goalsAgainst += homeScore; }
    if (homeScore > awayScore) { if (home) { home.wins++; home.points += rules.win; } if (away) { away.losses++; away.points += rules.loss; } }
    else if (awayScore > homeScore) { if (away) { away.wins++; away.points += rules.win; } if (home) { home.losses++; home.points += rules.loss; } }
    else { if (home) { home.draws++; home.points += rules.draw; } if (away) { away.draws++; away.points += rules.draw; } }
  }
  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.performance = row.played && rules.win ? Math.round(row.points / (row.played * Math.max(rules.win, rules.draw, rules.loss)) * 100) : 0;
  }
  // Resolve each tied cohort together. Pairwise comparisons are wrong for three-way ties.
  const order = (cohort, index) => {
    if (cohort.length < 2 || index >= rules.tiebreakers.length) return cohort;
    const key = rules.tiebreakers[index];
    if (key === 'name') return cohort.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const mini = key.startsWith('headToHead') ? headToHead(fixtures, cohort.map((row) => row.id), rules) : null;
    const value = (row) => mini ? mini.get(row.id)[key === 'headToHeadPoints' ? 'points' : 'goalDifference'] : row[key];
    const sorted = [...cohort].sort((a, b) => (key === 'goalsAgainst' || key === 'fairPlay' ? value(a) - value(b) : value(b) - value(a)));
    const result = [];
    for (let at = 0; at < sorted.length;) {
      let end = at + 1;
      while (end < sorted.length && value(sorted[end]) === value(sorted[at])) end++;
      result.push(...order(sorted.slice(at, end), index + 1)); at = end;
    }
    return result;
  };
  return order([...rows.values()], 0);
}

export function knockoutPlan(teams, { allowByes = false, thirdPlace = false } = {}) {
  validateParticipants(teams);
  const count = teams.length;
  const size = 2 ** Math.ceil(Math.log2(count));
  if (size > 64) throw new Error('O mata-mata aceita no máximo 64 participantes.');
  if (size !== count && !allowByes) throw new Error(`${count} equipes exigem ${size - count} avanços automáticos ou uma fase preliminar explícita.`);
  const byes = size - count;
  const preliminary = size === count ? 0 : count - size / 2;
  const direct = count - preliminary * 2;
  const first = [];
  for (let i = 0; i < preliminary; i++) first.push({ id: `preliminary-${i + 1}`, phase: 'Preliminar', round: 1, homeId: teams[direct + i * 2].id, awayId: teams[direct + i * 2 + 1].id, homeScore: null, awayScore: null, winnerId: null });
  const slots = [];
  for (let i = 0; i < Math.max(direct, first.length); i++) {
    if (i < direct) slots.push({ teamId: teams[i].id });
    if (i < first.length) slots.push({ winnerOf: first[i].id });
  }
  const rounds = [];
  let current = slots;
  while (current.length >= 2) {
    const name = phaseNames.get(current.length);
    const matches = Array.from({ length: current.length / 2 }, (_, index) => ({ id: `${current.length}-${index + 1}`, phase: name, round: rounds.length + (preliminary ? 2 : 1), home: current[index * 2], away: current[index * 2 + 1], homeScore: null, awayScore: null, winnerId: null }));
    rounds.push({ name, matches });
    current = matches.map((match) => ({ winnerOf: match.id }));
  }
  if (thirdPlace && count < 4) throw new Error('A disputa de terceiro lugar exige pelo menos quatro equipes.');
  return { format: 'knockout', teamCount: count, preliminary: first, directAdvances: direct, byes, rounds, thirdPlace: thirdPlace ? { id: 'third-place', phase: 'Terceiro lugar', home: { loserOf: rounds.at(-2).matches[0].id }, away: { loserOf: rounds.at(-2).matches[1].id } } : null, matchCount: count - 1 + (thirdPlace ? 1 : 0) };
}

export function resolvedWinner(match, { penalties = null } = {}) {
  if (match.status !== 'confirmed' || match.homeScore == null || match.awayScore == null) return null;
  const diff = validateScore(match.homeScore) - validateScore(match.awayScore);
  if (diff) return diff > 0 ? match.homeId : match.awayId;
  if (!penalties || penalties.homeScore === penalties.awayScore) return null;
  return penalties.homeScore > penalties.awayScore ? match.homeId : match.awayId;
}

export function resolveKnockoutBracket(plan, results, { existingMatches = [] } = {}) {
  const recorded = new Map(results.map((match) => [match.id, match]));
  if (recorded.size !== results.length) throw new Error('Há resultados duplicados no chaveamento.');
  const outcome = new Map();
  const resolveSlot = (slot) => slot?.teamId || (slot?.winnerOf ? outcome.get(slot.winnerOf)?.winnerId : slot?.loserOf ? outcome.get(slot.loserOf)?.loserId : null) || null;
  const resolveMatch = (template) => {
    const homeId = template.homeId || resolveSlot(template.home);
    const awayId = template.awayId || resolveSlot(template.away);
    const old = existingMatches.find((match) => match.id === template.id);
    if (old && old.status === 'confirmed' && (old.homeId !== homeId || old.awayId !== awayId)) throw new Error(`A correção altera os participantes da partida ${template.id}, que já foi confirmada. Exige revisão administrativa.`);
    const result = recorded.get(template.id);
    if (result && (!homeId || !awayId || result.homeId !== homeId || result.awayId !== awayId)) throw new Error(`O resultado de ${template.id} não corresponde aos classificados atuais.`);
    const winnerId = result ? resolvedWinner(result, { penalties: result.penalties }) : null;
    const loserId = winnerId ? (winnerId === homeId ? awayId : homeId) : null;
    const resolved = { ...template, homeId, awayId, winnerId, loserId, status: result?.status || 'scheduled', homeScore: result?.homeScore ?? null, awayScore: result?.awayScore ?? null };
    outcome.set(template.id, resolved);
    return resolved;
  };
  const preliminary = plan.preliminary.map(resolveMatch);
  const rounds = plan.rounds.map((round) => ({ ...round, matches: round.matches.map(resolveMatch) }));
  const thirdPlace = plan.thirdPlace ? resolveMatch(plan.thirdPlace) : null;
  return { preliminary, rounds, thirdPlace, championId: rounds.at(-1).matches[0].winnerId };
}

export function validateFixtureSchedule(fixtures, teams, { rounds = null, matchesPerTeam = null, noByes = false } = {}) {
  validateParticipants(teams);
  const ids = new Set(teams.map((team) => team.id));
  const byRound = new Map(); const opponents = new Set(); const total = new Map(teams.map((team) => [team.id, 0]));
  for (const match of fixtures) {
    if (!ids.has(match.homeId) || !ids.has(match.awayId) || match.homeId === match.awayId) throw new Error('Confronto com equipe inválida.');
    const round = Number(match.round);
    if (!Number.isInteger(round) || round < 1) throw new Error('Rodada inválida.');
    const pair = [match.homeId, match.awayId].sort().join('|');
    if (opponents.has(pair)) throw new Error('Confronto duplicado.');
    opponents.add(pair);
    const playing = byRound.get(round) || new Set();
    if (playing.has(match.homeId) || playing.has(match.awayId)) throw new Error(`Equipe escalada duas vezes na rodada ${round}.`);
    playing.add(match.homeId); playing.add(match.awayId); byRound.set(round, playing);
    total.set(match.homeId, total.get(match.homeId) + 1); total.set(match.awayId, total.get(match.awayId) + 1);
  }
  if (rounds != null && (byRound.size !== rounds || [...byRound.keys()].some((round) => round > rounds))) throw new Error('Quantidade de rodadas inconsistente.');
  if (noByes && [...byRound.values()].some((playing) => playing.size !== teams.length)) throw new Error('Há equipe de folga em uma rodada.');
  if (matchesPerTeam != null && [...total.values()].some((count) => count !== matchesPerTeam)) throw new Error('Quantidade de partidas por equipe inconsistente.');
  return { rounds: byRound.size, matchCount: fixtures.length, matchesPerTeam: Object.fromEntries(total) };
}

export function scheduleFixtures(fixtures, { startAt, matchMinutes, intervalMinutes = 0, stations, synchronizedRounds = false } = {}) {
  if (!Array.isArray(fixtures) || !fixtures.length) throw new Error('Não há partidas para agendar.');
  const start = new Date(startAt).getTime();
  if (!Number.isFinite(start)) throw new Error('Informe uma data e horário de início válidos.');
  if (!Number.isInteger(matchMinutes) || matchMinutes < 1 || !Number.isInteger(intervalMinutes) || intervalMinutes < 0) throw new Error('Duração ou intervalo inválido.');
  if (!Number.isInteger(stations) || stations < 1) throw new Error('Informe a quantidade de estações disponíveis.');
  const rounds = [...new Set(fixtures.map((match) => match.round))].sort((a, b) => a - b);
  let cursor = start;
  const scheduled = [];
  for (const round of rounds) {
    const matches = fixtures.filter((match) => match.round === round);
    if (synchronizedRounds && matches.length > stations) throw new Error(`A rodada ${round} tem ${matches.length} partidas, mas somente ${stations} estações. Rodadas sincronizadas exigem ${matches.length} estações.`);
    const occupied = new Set();
    matches.forEach((match, index) => {
      if (occupied.has(match.homeId) || occupied.has(match.awayId)) throw new Error(`Uma equipe aparece duas vezes na rodada ${round}.`);
      occupied.add(match.homeId); occupied.add(match.awayId);
      const wave = Math.floor(index / stations);
      scheduled.push({ ...match, scheduledAt: new Date(cursor + wave * matchMinutes * 60000).toISOString(), station: index % stations + 1, wave: wave + 1 });
    });
    cursor += Math.ceil(matches.length / stations) * matchMinutes * 60000 + intervalMinutes * 60000;
  }
  return { fixtures: scheduled, endsAt: new Date(cursor - intervalMinutes * 60000).toISOString(), rounds: rounds.length };
}

const corujaoPresets = new Map([
  [8, { sizes: [4, 4], advances: 4, guaranteed: 2, extras: 0 }],
  [10, { sizes: [3, 3, 4], advances: 4, guaranteed: 1, extras: 1 }],
  [12, { sizes: [4, 4, 4], advances: 8, guaranteed: 2, extras: 2 }],
  [16, { sizes: [4, 4, 4, 4], advances: 8, guaranteed: 2, extras: 0 }],
  [18, { sizes: [3, 3, 4, 4, 4], advances: 8, guaranteed: 1, extras: 3 }],
  [20, { sizes: [4, 4, 4, 4, 4], advances: 8, guaranteed: 1, extras: 3 }],
  [24, { sizes: Array(6).fill(4), advances: 16, guaranteed: 2, extras: 4 }],
  [28, { sizes: Array(7).fill(4), advances: 16, guaranteed: 2, extras: 2 }],
  [32, { sizes: Array(8).fill(4), advances: 16, guaranteed: 2, extras: 0 }],
]);

export function recommendCorujao(count, { stations = null, matchMinutes = null, intervalMinutes = 0 } = {}) {
  if (!Number.isInteger(count) || count < 8 || count > 32) return { status: 'incompatible', reason: 'O Corujão padrão exige de 8 a 32 equipes.' };
  if (count % 2) return { status: 'incompatible', reason: `Com ${count} equipes, três partidas por equipe exigiriam ${count * 3 / 2} confrontos, uma quantidade não inteira. Ajuste para um número par.` };
  const preset = corujaoPresets.get(count);
  if (!preset) return { status: 'attention', reason: `Há ${count * 3 / 2} partidas possíveis em três rodadas, mas ainda não há critério de classificação aprovado para ${count} equipes. Ajuste a quantidade ou defina um regulamento específico antes de criar o torneio.`, groupMatches: count * 3 / 2, matchesPerRound: count / 2 };
  if (stations !== null && (!Number.isInteger(stations) || stations < 1)) throw new Error('Informe ao menos uma estação disponível.');
  if (matchMinutes !== null && (!Number.isFinite(matchMinutes) || matchMinutes <= 0)) throw new Error('A duração da partida deve ser positiva.');
  const matchesPerRound = count / 2;
  const synchronized = stations === null ? null : stations >= matchesPerRound;
  const waves = stations === null ? null : Math.ceil(matchesPerRound / stations);
  const knockoutWaves = stations === null ? null : Array.from({ length: Math.log2(preset.advances) }, (_, index) => Math.ceil((preset.advances / 2 ** (index + 1)) / stations)).reduce((sum, count) => sum + count, 0);
  const estimatedMinutes = matchMinutes === null || waves === null ? null : (3 * waves + knockoutWaves) * matchMinutes + 2 * intervalMinutes;
  const warnings = [];
  if (preset.extras) warnings.push('Há vagas por comparação entre grupos; o regulamento deve definir desempates e comparabilidade antes da homologação.');
  if (count === 20) warnings.push('Cinco líderes e somente três dos cinco vice-líderes avançam.');
  if (preset.sizes.includes(3)) warnings.push('Grupos de três realizam confrontos cruzados; a classificação continua separada por grupo.');
  if (stations === null) warnings.push('Informe a quantidade de estações para validar a simultaneidade das rodadas.');
  if (synchronized === false) warnings.push(`${stations} estação(ões) não permitem ${matchesPerRound} jogos simultâneos por rodada.`);
  return { status: synchronized === false ? 'incompatible' : warnings.length ? 'attention' : 'recommended', teamCount: count, groupSizes: preset.sizes, groupMatches: count * 3 / 2, matchesPerRound, rounds: 3, gamesPerTeam: 3, advances: preset.advances, guaranteedPerGroup: preset.guaranteed, extraPlaces: preset.extras, knockoutStart: phaseNames.get(preset.advances), totalMatches: count * 3 / 2 + preset.advances - 1, synchronized, waves, estimatedMinutes, warnings };
}

export function corujaoPlan(teams, options = {}) {
  validateParticipants(teams, { min: 8, max: 32 });
  const recommendation = recommendCorujao(teams.length, options);
  if (!recommendation.groupSizes) throw new Error(recommendation.reason);
  let offset = 0;
  const groups = recommendation.groupSizes.map((size, index) => ({ id: `group-${index + 1}`, name: `Grupo ${String.fromCharCode(65 + index)}`, teams: teams.slice(offset, offset += size) }));
  const fixtures = [];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (group.teams.length === 4) {
      const local = generateFixtures(group.teams);
      for (const match of local) fixtures.push({ ...match, id: `corujao-${group.id}-${match.id}`, groupId: group.id, phase: 'groups' });
    } else {
      const partner = groups[index + 1];
      if (!partner || partner.teams.length !== 3) throw new Error('Grupos de três precisam formar pares para confrontos cruzados.');
      for (let round = 0; round < 3; round++) for (let slot = 0; slot < 3; slot++) fixtures.push({ id: `corujao-cross-${index}-${round}-${slot}`, round: round + 1, homeId: group.teams[slot].id, awayId: partner.teams[(slot + round) % 3].id, groupId: `${group.id}|${partner.id}`, phase: 'groups', homeScore: null, awayScore: null, history: [] });
      index++;
    }
  }
  validateFixtureSchedule(fixtures, teams, { rounds: 3, matchesPerTeam: 3, noByes: true });
  if (fixtures.length !== recommendation.groupMatches || [1, 2, 3].some((round) => fixtures.filter((match) => match.round === round).length !== recommendation.matchesPerRound)) throw new Error('A agenda do Corujão não atende ao total obrigatório de partidas.');
  return { format: 'corujao', recommendation, groups, fixtures };
}

const corujaoQualification = new Map([
  [8, { guaranteed: [2, 2] }], [10, { guaranteed: [1, 1, 2] }],
  [12, { guaranteed: [2, 2, 2], extraRank: 3, extraCount: 2 }],
  [16, { guaranteed: [2, 2, 2, 2] }], [18, { guaranteed: [1, 1, 2, 2, 2] }],
  [20, { guaranteed: [1, 1, 1, 1, 1], extraRank: 2, extraCount: 3 }],
  [24, { guaranteed: Array(6).fill(2), extraRank: 3, extraCount: 4 }],
  [28, { guaranteed: Array(7).fill(2), extraRank: 3, extraCount: 2 }],
  [32, { guaranteed: Array(8).fill(2) }],
]);

export function corujaoQualifiers(plan, completedFixtures, { rules, crossGroupTiebreakers } = {}) {
  if (plan?.format !== 'corujao') throw new Error('Plano do Corujão inválido.');
  if (!rules || !Array.isArray(crossGroupTiebreakers)) throw new Error('Defina pontuação e critérios de comparação entre grupos antes de homologar classificados.');
  const qualification = corujaoQualification.get(plan.recommendation.teamCount);
  if (!qualification) throw new Error('Critério de classificação ainda não aprovado para esta quantidade.');
  const values = new Map(completedFixtures.map((match) => [match.id, match]));
  if (values.size !== plan.fixtures.length || plan.fixtures.some((match) => {
    const result = values.get(match.id);
    return !result || result.status !== 'confirmed' || result.homeId !== match.homeId || result.awayId !== match.awayId || result.homeScore == null || result.awayScore == null;
  })) throw new Error('Confirme todos os resultados da primeira fase antes da classificação.');
  const results = plan.fixtures.map((match) => values.get(match.id));
  const rankingRules = { ...rules, tiebreakers: rules.tiebreakers || ['points', 'wins', 'goalDifference', 'goalsFor'] };
  const groupTables = plan.groups.map((group) => standings(group.teams, results, rankingRules, { allowOutsideOpponents: true }));
  const sameOn = (a, b, keys) => keys.every((key) => a[key] === b[key]);
  const internalKeys = rankingRules.tiebreakers.filter((key) => numericCriteria.has(key) && !key.startsWith('headToHead'));
  const selected = [];
  groupTables.forEach((table, index) => {
    const seats = qualification.guaranteed[index];
    if (seats < table.length && sameOn(table[seats - 1], table[seats], internalKeys)) throw new Error(`Empate sem solução no limite de classificação do ${plan.groups[index].name}. Defina critério adicional ou decisão administrativa.`);
    selected.push(...table.slice(0, seats).map((row) => ({ ...row, groupId: plan.groups[index].id, groupPosition: table.indexOf(row) + 1 })));
  });
  if (qualification.extraCount) {
    const keys = crossGroupTiebreakers;
    if (!keys.length || keys.some((key) => !['points', 'wins', 'goalDifference', 'goalsFor', 'goalsAgainst', 'fairPlay'].includes(key))) throw new Error('Use critérios comparáveis e explícitos entre grupos.');
    const candidates = groupTables.map((table, index) => ({ ...table[qualification.extraRank - 1], groupId: plan.groups[index].id, groupPosition: qualification.extraRank }));
    candidates.sort((a, b) => {
      for (const key of keys) { const diff = key === 'goalsAgainst' || key === 'fairPlay' ? a[key] - b[key] : b[key] - a[key]; if (diff) return diff; }
      return 0;
    });
    if (sameOn(candidates[qualification.extraCount - 1], candidates[qualification.extraCount], keys)) throw new Error('Empate na última vaga entre grupos. O regulamento precisa prever uma decisão antes do mata-mata.');
    selected.push(...candidates.slice(0, qualification.extraCount));
  }
  if (selected.length !== plan.recommendation.advances || new Set(selected.map((row) => row.id)).size !== selected.length) throw new Error('Classificação incompatível com o chaveamento.');
  return { groupTables, qualifiers: selected, knockoutStart: plan.recommendation.knockoutStart };
}

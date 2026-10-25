import { ESPORTS_DEMO } from './esports-demo.mjs';
import { updateResult, validateScore } from './engine.mjs';

const STORAGE_KEY = 'tr-campeonatos-interactive-demo-v1';
const eligibleIds = new Set(ESPORTS_DEMO.fixtures.filter((fixture) => fixture.homeScore === null).map((fixture) => fixture.id));
let memoryResults = {};

function storedResults() {
  let value;
  try { value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || memoryResults; }
  catch { value = memoryResults; }
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, scores]) => {
      try {
        return eligibleIds.has(id) && Array.isArray(scores) && scores.length === 2 &&
          Number.isInteger(scores[0]) && Number.isInteger(scores[1]) &&
          validateScore(scores[0]) === scores[0] && validateScore(scores[1]) === scores[1];
      } catch { return false; }
    }));
  } catch { return {}; }
}

export function getInteractiveFixtures() {
  return Object.entries(storedResults()).reduce((fixtures, [id, [home, away]]) =>
    updateResult(fixtures, id, home, away), ESPORTS_DEMO.fixtures);
}

export function hasInteractiveResult(id) {
  return Object.hasOwn(storedResults(), id);
}

export function saveInteractiveResult(id, home, away) {
  if (!eligibleIds.has(id)) throw new Error('Esta partida não está disponível para simulação.');
  const homeScore = validateScore(home);
  const awayScore = validateScore(away);
  const results = { ...storedResults(), [id]: [homeScore, awayScore] };
  memoryResults = results;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(results)); } catch { /* The simulation still works for this visit. */ }
  return getInteractiveFixtures();
}

export function undoInteractiveResult(id) {
  if (!eligibleIds.has(id)) throw new Error('Esta partida não está disponível para simulação.');
  const results = { ...storedResults() };
  delete results[id];
  memoryResults = results;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(results)); } catch { /* The simulation still works for this visit. */ }
  return getInteractiveFixtures();
}

export function resetInteractiveResults() {
  memoryResults = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* No persistent results to clear. */ }
  return getInteractiveFixtures();
}

export function demoDateForRound(round) {
  const date = new Date();
  date.setHours(21, 30, 0, 0);
  date.setDate(date.getDate() + (round - 2) * 3);
  return date;
}

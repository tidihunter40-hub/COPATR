import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogStatus, createCatalogItems, filterCatalog, phaseLabel } from '../dist/championships-catalog-data.mjs';

const base = {
  competitions: [
    { id: 'a', name: 'Taça Ativa', sport: 'Futebol', status: 'active', updated_at: '2026-10-25T14:00:00Z' },
    { id: 'b', name: 'Copa Finalizada', sport: 'Futsal', status: 'active', updated_at: '2026-10-24T14:00:00Z' },
  ],
  seasons: [
    { id: 'sa', competition_id: 'a', label: '2026', status: 'active', starts_on: '2026-10-20', created_at: '2026-10-01T00:00:00Z' },
    { id: 'sb', competition_id: 'b', label: '2025', status: 'completed', starts_on: '2025-10-20', created_at: '2025-10-01T00:00:00Z' },
  ],
  entries: [{ id: 'home', season_id: 'sa', club_name_snapshot: 'Azul FC', status: 'confirmed' }, { id: 'away', season_id: 'sa', club_name_snapshot: 'Prata FC', status: 'confirmed' }],
  matches: [{ id: 'm', season_id: 'sa', phase: 'semifinal', status: 'scheduled', scheduled_at: '2026-10-28T18:00:00Z', home_entry_id: 'home', away_entry_id: 'away', home_score: null, away_score: null }],
  champions: [{ season_id: 'sb', place: 1, club: { official_name: 'Campeão Real' } }],
};

test('catálogo usa somente estados e dados oficiais disponíveis', () => {
  const [active, completed] = createCatalogItems(base);
  assert.deepEqual(active.status, { id: 'active', label: 'Em andamento' });
  assert.equal(active.teamCount, 2);
  assert.equal(active.match.home, 'Azul FC');
  assert.equal(active.phase, 'Semifinais');
  assert.equal(completed.status.label, 'Finalizado');
  assert.equal(completed.champion, 'Campeão Real');
  assert.equal(catalogStatus({ status: 'draft' }, null).label, 'Em breve');
  assert.equal(phaseLabel('final'), 'Final');
});

test('busca, filtros e ordenação trabalham sobre o catálogo público', () => {
  const items = createCatalogItems(base);
  assert.deepEqual(filterCatalog(items, { search: 'finalizada' }).map((item) => item.id), ['b']);
  assert.deepEqual(filterCatalog(items, { status: 'active' }).map((item) => item.id), ['a']);
  assert.deepEqual(filterCatalog(items, { sport: 'Futsal' }).map((item) => item.id), ['b']);
  assert.deepEqual(filterCatalog(items, { sort: 'final' }).map((item) => item.id), ['b', 'a']);
});

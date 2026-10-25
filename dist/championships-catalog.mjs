import { createCatalogItems, filterCatalog } from './championships-catalog-data.mjs';

const page = document.documentElement.dataset.page;
const mount = document.querySelector('#campeonatos');
if (page === 'campeonatos' && mount) {
  document.body.classList.add('championships-catalog-page');
  mount.innerHTML = `<div class="championships-hero"><div class="championships-hero-copy"><span class="championships-kicker">TR CAMPEONATOS</span><h1>A glória merece<br><em>um lugar</em><br>na história.</h1><p>Crie, organize e acompanhe seus campeonatos com uma plataforma completa, moderna e poderosa.</p><div class="championships-hero-actions"><a href="/entrar?retorno=%2Fpainel%2Fcampeonatos%2Fnovo">Criar campeonato <span aria-hidden="true">→</span></a><a href="/demonstracao">Ver demonstração <span aria-hidden="true">↗</span></a></div><ul class="championships-hero-benefits"><li>Fácil de usar</li><li>Seguro e estável</li><li>Histórico completo</li></ul></div><p class="championships-hero-signature" aria-hidden="true">Sua competição.<br>Nossa tecnologia.</p></div><section class="championships-directory" aria-labelledby="championships-directory-title"><div class="championships-directory-heading"><div><span>VITRINE PÚBLICA</span><h2 id="championships-directory-title">Campeonatos em destaque</h2></div><p id="catalog-count" aria-live="polite">Carregando campeonatos publicados…</p></div><form class="championships-filters" id="championships-filters"><label class="catalog-search"><span class="sr-only">Buscar campeonato</span><input name="search" type="search" placeholder="Buscar campeonato" autocomplete="off"></label><label><span>Status</span><select name="status"><option value="all">Todos os status</option></select></label><label><span>Modalidade</span><select name="sport"><option value="all">Todas</option></select></label><label><span>Ordenar</span><select name="sort"><option value="recent">Mais recentes</option><option value="start">Início mais próximo</option><option value="active">Em andamento</option><option value="final">Finalizados</option></select></label></form><div class="championships-grid" id="championships-grid" aria-live="polite"></div></section>`;
  const grid = mount.querySelector('#championships-grid');
  const form = mount.querySelector('#championships-filters');
  const count = mount.querySelector('#catalog-count');

  const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
  const render = (data) => {
    const items = createCatalogItems(data);
    const statusSelect = form.elements.status;
    const sportSelect = form.elements.sport;
    [...new Map(items.map((item) => [item.status.id, item.status.label]))].forEach(([id, label]) => { const option = new Option(label, id); statusSelect.add(option); });
    [...new Set(items.map((item) => item.sport).filter(Boolean))].sort().forEach((sport) => sportSelect.add(new Option(sport, sport)));
    const draw = () => {
      const visible = filterCatalog(items, Object.fromEntries(new FormData(form)));
      grid.replaceChildren();
      count.textContent = `${visible.length} ${visible.length === 1 ? 'campeonato publicado' : 'campeonatos publicados'}`;
      if (!visible.length) { const empty = document.createElement('p'); empty.className = 'catalog-empty'; empty.textContent = 'Nenhum campeonato corresponde aos filtros selecionados.'; grid.append(empty); return; }
      visible.forEach((item) => {
        const card = document.createElement('article'); card.className = 'championship-card';
        const top = document.createElement('div'); top.className = 'championship-card-top';
        const sport = document.createElement('span'); sport.className = 'championship-sport'; sport.textContent = item.sport;
        const badge = document.createElement('span'); badge.className = `championship-status status-${item.status.id}`; badge.textContent = item.status.label;
        top.append(sport, badge);
        const title = document.createElement('h3'); title.textContent = item.name;
        const facts = document.createElement('div'); facts.className = 'championship-facts';
        if (item.season?.label) { const value = document.createElement('span'); value.textContent = item.season.label; facts.append(value); }
        if (item.teamCount) { const value = document.createElement('span'); value.textContent = `${item.teamCount} ${item.teamCount === 1 ? 'equipe' : 'equipes'}`; facts.append(value); }
        if (item.phase) { const value = document.createElement('span'); value.textContent = item.phase; facts.append(value); }
        const detail = document.createElement('div'); detail.className = 'championship-detail';
        if (item.match) { const label = document.createElement('strong'); label.textContent = item.match.kind; const text = document.createElement('span'); const teams = [item.match.home, item.match.away].filter(Boolean).join(' × '); const score = item.match.home_score !== null && item.match.away_score !== null ? ` · ${item.match.home_score} × ${item.match.away_score}` : ''; text.textContent = [teams, score, date(item.match.scheduled_at)].filter(Boolean).join(' · '); detail.append(label, text); }
        else { const text = document.createElement('span'); text.textContent = 'Agenda e resultados aparecem quando forem cadastrados.'; detail.append(text); }
        if (item.champion) { const champion = document.createElement('p'); champion.className = 'championship-champion'; champion.textContent = `Campeão confirmado: ${item.champion}`; detail.append(champion); }
        const link = document.createElement('a'); link.className = 'championship-open'; link.href = `/c/${encodeURIComponent(item.id)}`; link.textContent = 'Ver campeonato';
        card.append(top, title, facts, detail, link); grid.append(card);
      });
    };
    form.addEventListener('input', draw); form.addEventListener('change', draw); draw();
  };
  const receive = (event) => render(event.detail);
  window.addEventListener('tr:public-home-data', receive, { once: true });
  if (globalThis.TRPublicHomeData) render(globalThis.TRPublicHomeData);
}

const KEY = 'tr-campeonatos-graphics-mode';
const valid = (value) => value === 'performance' ? 'performance' : 'ultra';
const root = document.documentElement;

function mode() { return valid(root.dataset.graphics); }

function update(modeName, persist = true) {
  const next = valid(modeName);
  root.dataset.graphics = next;
  if (persist) {
    try { localStorage.setItem(KEY, next); } catch { /* Private browsing can block storage. */ }
  }
  document.querySelectorAll('.tr-graphics').forEach((control) => {
    const button = control.querySelector('.tr-graphics-button');
    const label = control.querySelector('.tr-graphics-current');
    const visibleLabel = next === 'ultra' ? 'ULTRA' : 'DESEMPENHO';
    if (label && label.textContent !== visibleLabel) label.textContent = visibleLabel;
    if (button) button.setAttribute('aria-label', `Gráficos: ${next === 'ultra' ? 'Ultra' : 'Desempenho'}. Alterar qualidade gráfica`);
    control.querySelectorAll('[data-graphics-option]').forEach((option) => {
      const selected = option.dataset.graphicsOption === next;
      option.setAttribute('aria-checked', String(selected));
      option.classList.toggle('selected', selected);
    });
  });
  document.dispatchEvent(new CustomEvent('graphicschange', { detail: { mode: next } }));
}

function createControl() {
  const control = document.createElement('div');
  control.className = 'tr-graphics';
  control.innerHTML = `<button class="tr-graphics-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="tr-graphics-menu"><span aria-hidden="true">🎮</span><span class="tr-graphics-prefix"> GRÁFICOS: </span><strong class="tr-graphics-current">ULTRA</strong><span aria-hidden="true">⌄</span></button><div class="tr-graphics-menu" id="tr-graphics-menu" role="menu" aria-label="Qualidade gráfica" hidden><p>QUALIDADE GRÁFICA</p><button type="button" role="menuitemradio" data-graphics-option="ultra" aria-checked="true"><strong>💎 ULTRA</strong><small>Campos detalhados, iluminação e imagens em alta definição.</small></button><button type="button" role="menuitemradio" data-graphics-option="performance" aria-checked="false"><strong>⚡ DESEMPENHO</strong><small>Imagens otimizadas e efeitos gráficos reduzidos.</small></button></div>`;
  const trigger = control.querySelector('.tr-graphics-button');
  const menu = control.querySelector('.tr-graphics-menu');
  const options = [...control.querySelectorAll('[data-graphics-option]')];
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  trigger.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) options.find((option) => option.dataset.graphicsOption === mode())?.focus();
  });
  options.forEach((option, index) => {
    option.addEventListener('click', () => { update(option.dataset.graphicsOption); close(); trigger.focus(); });
    option.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { close(); trigger.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
      }
    });
  });
  control.addEventListener('keydown', (event) => { if (event.key === 'Escape') { close(); trigger.focus(); } });
  document.addEventListener('pointerdown', (event) => { if (!control.contains(event.target)) close(); });
  return control;
}

let control;
const arenas = new WeakSet();
const arenaObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    entry.target.classList.add('tr-arena-visible');
    arenaObserver.unobserve(entry.target);
  }
}, { rootMargin: '300px 0px' }) : null;
function attach() {
  const header = document.querySelector('.site-header, .demo-header, .planner-header, .public-header, .panel-header, .setup-shell');
  if (!header) return;
  const mobileNav = header.matches('.site-header') && matchMedia('(max-width:600px)').matches ? header.querySelector('.main-nav') : null;
  const target = mobileNav || header.querySelector('.header-actions') || header;
  if (!control) control = createControl();
  if (control.parentElement !== target) target.append(control);
  update(mode(), false);
  document.querySelectorAll('.public-fixture.match-arena[class*="demo-arena--"]').forEach((arena) => {
    if (arenas.has(arena)) return;
    arenas.add(arena);
    if (arenaObserver) arenaObserver.observe(arena);
    else arena.classList.add('tr-arena-visible');
  });
}

attach();
const observer = new MutationObserver(() => attach());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', attach);
window.addEventListener('storage', (event) => { if (event.key === KEY) update(event.newValue, false); });
window.TRGraphics = Object.freeze({ get mode() { return mode(); }, setMode: update });

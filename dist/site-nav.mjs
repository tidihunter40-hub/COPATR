const toggle = document.querySelector('#menu-toggle');
const nav = document.querySelector('#main-nav');
toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Abrir menu');
}));
const sections = [...(nav?.querySelectorAll('a[href^="#"]') || [])]
  .map((link) => ({ link, section: document.querySelector(link.getAttribute('href')) }))
  .filter(({ section }) => section);
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    sections.forEach(({ link, section }) => {
      const active = section === visible.target;
      link.classList.toggle('nav-active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: [0, .15, .5] });
  sections.forEach(({ section }) => observer.observe(section));
}

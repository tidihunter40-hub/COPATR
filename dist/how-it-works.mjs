const page = document.documentElement.dataset.page;
const steps = [
  ['01', 'account', 'Acesse sua conta', 'Entre na sua área para organizar uma competição vinculada à sua conta.'],
  ['02', 'settings', 'Configure seu campeonato', 'Defina nome, modalidade, formato, regras e todas as preferências.'],
  ['03', 'teams', 'Cadastre suas equipes', 'Adicione os times, escudos e jogadores de forma simples.'],
  ['04', 'trophy', 'Gerencie e acompanhe', 'Crie tabelas, resultados, fases e acompanhe tudo em tempo real.'],
];
const icons = {
  account: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 5h16l8 8v29H13zM29 5v10h10M20 25h10M20 31h10M20 37h7"/><path d="M35 35v9M30.5 39.5h9"/></svg>',
  settings: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 15a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"/><path d="M21 5h6l2 6 5 2 5-3 4 5-4 5 1 6 4 4-3 6-6-1-5 3-2 6h-6l-2-6-5-3-6 1-3-6 4-4 1-6-4-5 4-5 5 3 5-2z"/></svg>',
  teams: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="17" r="6"/><circle cx="33" cy="19" r="5"/><path d="M6 40v-3c0-7 5-11 12-11s12 4 12 11v3M29 29c7 0 12 3 12 10v1"/></svg>',
  trophy: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 7h20v12a10 10 0 0 1-20 0V7ZM14 11H8v4c0 5 3 8 8 8M34 11h6v4c0 5-3 8-8 8M24 29v8M16 42h16"/></svg>',
};

if (page === 'como-funciona') {
  document.body.classList.add('how-page');
  const banner = document.querySelector('#route-banner');
  if (banner) banner.hidden = true;
  const process = document.querySelector('#como-funciona');
  if (process) process.innerHTML = `<section class="how-hero"><div class="how-shell how-hero-copy"><span>DO PRIMEIRO CLÁSSICO AO APITO FINAL</span><h1>Como <em>funciona</em></h1><p>Conheça o fluxo de criação, gestão e acompanhamento de um campeonato na TR Campeonatos.</p></div></section><section class="how-steps"><div class="how-shell"><header class="how-section-heading"><div><span>COMO FUNCIONA</span><h2>DA IDEIA AO <em>APITO INICIAL</em></h2></div><p>Quatro etapas simples para você criar, organizar e acompanhar sua competição.</p></header><ol class="how-step-grid">${steps.map(([number, icon, title, copy]) => `<li class="how-step"><span class="how-step-number">${number}</span><span class="how-step-arrow" aria-hidden="true">›</span><article><span class="how-step-icon">${icons[icon]}</span><div><h3>${title}</h3><p>${copy}</p></div></article></li>`).join('')}</ol></div></section>`;
  const faq = document.querySelector('.faq-section');
  if (faq) faq.innerHTML = `<div class="how-faq-art" aria-hidden="true"><img src="/assets/gallery-silver-trophy.webp" alt=""></div><div class="how-shell how-faq-content"><header class="how-section-heading"><div><span>PERGUNTAS FREQUENTES</span><h2>ANTES DE <em>COMEÇAR.</em></h2></div><p>Tire suas dúvidas e comece sua competição com total segurança.</p></header><div class="how-faq-list"><details><summary>Preciso criar uma conta para testar?</summary><p>Não. A demonstração funciona sem conta e mantém seus dados apenas neste navegador.</p></details><details><summary>Posso realizar um campeonato real agora?</summary><p>O ambiente de demonstração é fictício. A gestão de competições reais exige acesso à conta do organizador.</p></details><details><summary>Quais modalidades posso cadastrar?</summary><p>O projeto trabalha com futebol, futsal, vôlei, basquete e e-sports, conforme os recursos disponíveis no ambiente.</p></details><details><summary>O que acontece se eu limpar os dados de navegação?</summary><p>Os dados criados na demonstração local podem ser removidos. Registros oficiais dependem do ambiente autenticado.</p></details></div></div>`;
  const footer = document.querySelector('.site-footer');
  if (footer) {
    footer.querySelectorAll('.footer-nav')[1].innerHTML = `<strong>TR CAMPEONATOS</strong><a href="/funcionalidades#historia">Histórico das equipes</a><a href="/campeonatos">Galeria de campeões</a><a href="/planos">Planos</a><a href="/contato">Contato</a>`;
    footer.querySelector('.footer-cta').innerHTML = `<span aria-hidden="true"><svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18v-3a11 11 0 0 1 22 0v3M5 18H3v7h6v-9H5m22 2h2v7h-6v-9h4M25 25c0 3-4 5-9 5h-2"/><path d="M11 29h5"/></svg></span><div><b>Ficou com alguma dúvida?</b><p>Fale conosco e tenha suporte completo.</p></div><a class="button button-outline" href="/contato">Entrar em contato <span aria-hidden="true">→</span></a>`;
    footer.querySelector('.footer-bottom').innerHTML = `<span>© ${new Date().getFullYear()} TR Campeonatos. Todos os direitos reservados.</span><span>Desenvolvido por TidiReis Soluções Digitais.</span>`;
  }
}

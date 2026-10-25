import { getAuthClient, type AuthConfig } from './auth-client';
import { preferredAccountName, type IdentityProfile } from './auth-identity';

type HeaderSurface = { root: HTMLElement; login: HTMLElement | null; cta: HTMLAnchorElement | null };

function findHeader(): HeaderSurface | null {
  const root = document.querySelector<HTMLElement>('.site-header .header-actions, .demo-header nav, .planner-header nav, .public-header nav');
  if (!root) return null;
  return {
    root,
    login: root.querySelector<HTMLElement>('.header-login'),
    cta: root.querySelector<HTMLAnchorElement>('.header-cta, .header-action, a[href^="/entrar?retorno="]'),
  };
}

export function startAuthHeader(config: AuthConfig) {
  if (!config.url || !config.anonKey) return;
  const client = getAuthClient(config);
  let initialized = false;
  const initialize = () => {
    if (initialized) return;
    const surface = findHeader();
    if (!surface) return;
    initialized = true;
    observer.disconnect();
    const { root, login, cta } = surface;
    const originalCta = cta?.innerHTML || '';
    const originalHref = cta?.getAttribute('href') || '';
    const switcher = document.createElement('div');
    switcher.className = 'account-switcher';
    switcher.hidden = true;
    switcher.innerHTML = `<button class="account-trigger" type="button" aria-haspopup="menu" aria-expanded="false"><span class="account-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.3" stroke="currentColor" stroke-width="1.8"/><path d="M5.3 20c.4-3.8 2.8-5.7 6.7-5.7s6.3 1.9 6.7 5.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><span class="account-name"></span><span class="account-chevron" aria-hidden="true">⌄</span></button><div class="account-dropdown" role="menu" hidden><span class="account-dropdown-name"></span><a role="menuitem" href="/painel">Meu painel</a><a role="menuitem" href="/minha-conta">Minha conta</a><button role="menuitem" type="button" data-sign-out>Sair da conta</button><span class="account-menu-status" role="status"></span></div>`;
    root.append(switcher);
    const trigger = switcher.querySelector<HTMLButtonElement>('.account-trigger')!;
    const dropdown = switcher.querySelector<HTMLElement>('.account-dropdown')!;
    const name = switcher.querySelector<HTMLElement>('.account-name')!;
    const dropdownName = switcher.querySelector<HTMLElement>('.account-dropdown-name')!;
    const logout = switcher.querySelector<HTMLButtonElement>('[data-sign-out]')!;
    const message = switcher.querySelector<HTMLElement>('.account-menu-status')!;
    let revision = 0;
    const closeMenu = () => { dropdown.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const guest = () => {
      revision++;
      closeMenu();
      switcher.hidden = true;
      root.classList.remove('is-authenticated');
      if (login) login.hidden = false;
      if (cta) { cta.innerHTML = originalCta; cta.setAttribute('href', originalHref); }
    };
    const authenticated = (accountName: string) => {
      name.textContent = accountName;
      name.title = accountName;
      dropdownName.textContent = accountName;
      trigger.setAttribute('aria-label', `Conta de ${accountName}`);
      if (login) login.hidden = true;
      if (cta) { cta.textContent = 'Meu painel'; cta.href = '/painel'; }
      switcher.hidden = false;
      root.classList.add('is-authenticated');
    };
    const refresh = async () => {
      const current = ++revision;
      const { data: { user }, error } = await client.auth.getUser();
      if (current !== revision) return;
      if (error || !user) { guest(); return; }
      const profileResult = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (current !== revision) return;
      authenticated(preferredAccountName(profileResult.error ? null : profileResult.data as IdentityProfile | null, user));
    };
    trigger.addEventListener('click', () => {
      const opening = dropdown.hidden;
      closeMenu();
      if (opening) { dropdown.hidden = false; trigger.setAttribute('aria-expanded', 'true'); }
    });
    document.addEventListener('click', (event) => { if (!switcher.contains(event.target as Node)) closeMenu(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !dropdown.hidden) { closeMenu(); trigger.focus(); } });
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      message.textContent = 'Saindo…';
      const { error } = await client.auth.signOut();
      if (error) { message.textContent = 'Não foi possível encerrar a sessão. Tente novamente.'; logout.disabled = false; return; }
      sessionStorage.removeItem('tr-selected-organization');
      guest();
      location.assign('/');
    });
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) guest();
      else window.setTimeout(() => { void refresh(); }, 0);
    });
    window.addEventListener('focus', () => { void refresh(); });
    window.addEventListener('tr:profile-updated', () => { void refresh(); });
    void refresh();
  };
  const observer = new MutationObserver(initialize);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  initialize();
}

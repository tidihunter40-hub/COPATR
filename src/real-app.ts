import { type SupabaseClient } from '@supabase/supabase-js';
import { getAuthClient } from './auth-client';
import { preferredAccountName, type IdentityProfile } from './auth-identity';
import { prepareSmartShield, type SmartShieldResult } from './smart-shield';

type Config = { url?: string; anonKey?: string };
type Context = { client: SupabaseClient; user: { id: string; email?: string }; organization: { id: string; name: string }; role: string };
type ProfileAuthorization = IdentityProfile & { account_role: 'visitor' | 'organizer' | 'platform_admin'; organizer_status: 'pending' | 'approved' | 'suspended' | 'rejected' };
const mount = () => document.querySelector<HTMLElement>('#real-app');
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const safeId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const readableDate = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Data a definir';
const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65);
const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
const editor = (role: string) => ['owner', 'admin', 'editor'].includes(role);
const approvedOrganizer = (profile: ProfileAuthorization | null) => Boolean(profile && profile.organizer_status === 'approved' && ['organizer', 'platform_admin'].includes(profile.account_role));
export const normalizeTeamSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export const filterTeamDirectory = <T extends { official_name: string; status?: string }>(teams: T[], query: string) => {
  const needle = normalizeTeamSearch(query);
  return teams.filter((team) => team.status !== 'archived' && (!needle || normalizeTeamSearch(team.official_name).includes(needle)));
};

type StoredShield = { path: string; status: 'processed' | 'original_fallback'; notice: string };

async function storeSmartShield(client: SupabaseClient, clubId: string, file: File, preparedResult?: SmartShieldResult): Promise<StoredShield> {
  const prepared = preparedResult || await prepareSmartShield(file);
  const jobId = crypto.randomUUID();
  const extension = prepared.source.mime === 'image/jpeg' ? 'jpg' : prepared.source.mime.split('/')[1];
  const originalPath = `${clubId}/original/${jobId}.${extension}`;
  const processedPath = prepared.processed ? `${clubId}/processed/${jobId}.png` : null;
  const originalUpload = await client.storage.from('club-crests').upload(originalPath, file, { upsert: false, contentType: prepared.source.mime });
  if (originalUpload.error) throw new Error(`Não foi possível guardar o original: ${originalUpload.error.message}`);
  if (prepared.processed && processedPath) {
    const outputUpload = await client.storage.from('club-crests').upload(processedPath, prepared.processed, { upsert: false, contentType: 'image/png' });
    if (outputUpload.error) throw new Error(`Original guardado, mas o escudo padronizado não foi salvo: ${outputUpload.error.message}`);
  }
  const path = processedPath || originalPath;
  const payload = {
    crest_path: path, crest_original_path: originalPath, crest_processed_path: processedPath,
    crest_processing_status: prepared.status, crest_processing_version: 1, crest_processing_meta: prepared.meta,
  };
  const update = await client.from('clubs').update(payload as any).eq('id', clubId);
  // The minimal fallback keeps the application usable until the migration is applied.
  if (update.error) {
    const legacy = await client.from('clubs').update({ crest_path: path }).eq('id', clubId);
    if (legacy.error) throw new Error(legacy.error.message);
  } else {
    await client.from('club_crest_jobs').insert({
      id: jobId, club_id: clubId, source_path: originalPath, processed_path: processedPath,
      status: prepared.status, processing_meta: prepared.meta,
    } as any);
  }
  return {
    path,
    status: prepared.status,
    notice: prepared.status === 'processed' ? 'Escudo padronizado em 512 px com transparência segura.' : 'Original preservado: o fundo não tinha confiança suficiente para remoção automática.',
  };
}

export function teamShieldMarkup(url: string | null | undefined, teamName: string, variant = 'medium', loading = 'lazy') {
  const label = escapeHtml(teamName);
  return `<span class="team-shield team-shield--${variant}">${url ? `<img src="${escapeHtml(url)}" alt="Escudo de ${label}" loading="${loading}" decoding="async">` : '<span class="team-shield-placeholder" aria-hidden="true"></span>'}</span>`;
}

function installPasswordVisibilityToggle(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>('input[name="password"]');
  if (!input || form.querySelector('[data-password-toggle]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'password-toggle';
  button.dataset.passwordToggle = 'true';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = 'Mostrar senha';
  button.addEventListener('click', () => {
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Mostrar senha' : 'Ocultar senha';
    button.setAttribute('aria-pressed', String(!visible));
  });
  input.insertAdjacentElement('afterend', button);
}

export async function startRealApp(config: Config) {
  const target = mount();
  const status = document.querySelector<HTMLElement>('#account-status');
  if (!config.url || !config.anonKey) {
    if (target) target.textContent = 'O ambiente oficial ainda não está configurado. A demonstração continua disponível.';
    if (status) status.textContent = 'O ambiente oficial ainda não está configurado. A demonstração continua disponível.';
    return;
  }
  const client = getAuthClient(config);
  if (location.pathname === '/entrar') return loginPage(client);
  if (location.pathname === '/minha-conta') return accountPage(client);
  if (location.pathname.startsWith('/c/')) return publicPage(client, location.pathname.split('/')[2]);
  if (location.pathname.startsWith('/clubes/')) return publicClub(client, location.pathname.split('/')[2]);
  if (location.pathname.startsWith('/painel')) return panelPage(client);
}

async function loginPage(client: SupabaseClient) {
  const status = document.querySelector<HTMLElement>('#account-status')!;
  const form = document.querySelector<HTMLFormElement>('#login-form')!;
  const recovery = document.querySelector<HTMLButtonElement>('#password-recovery')!;
  const requestedReturn = new URLSearchParams(location.search).get('retorno');
  const returnTo = requestedReturn && (/^\/painel(?:\/|$)/.test(requestedReturn) || requestedReturn === '/minha-conta') ? requestedReturn : '/painel';
  const recoveryMode = location.hash.includes('type=recovery');
  const { data: { user } } = await client.auth.getUser();
  if (recoveryMode && user) {
    status.textContent = 'Defina uma nova senha para sua conta.';
    form.innerHTML = '<label>Nova senha<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><button class="button button-primary" type="submit">Salvar nova senha</button>';
    form.hidden = false;
    installPasswordVisibilityToggle(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = String(new FormData(form).get('password') || '');
      const { error } = await client.auth.updateUser({ password });
      status.textContent = error ? error.message : 'Senha atualizada. Você já pode abrir o painel.';
      if (!error) form.innerHTML = '<a class="button button-primary" href="/painel">Abrir painel</a>';
    });
    return;
  }
  if (user) {
    status.innerHTML = `Sua sessão está ativa. <a href="${escapeHtml(returnTo)}">Abrir painel do organizador →</a>`;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'text-button'; button.textContent = 'Sair desta conta';
    button.addEventListener('click', async () => {
      const { error } = await client.auth.signOut();
      if (error) { status.textContent = 'Não foi possível encerrar a sessão. Tente novamente.'; return; }
      sessionStorage.removeItem('tr-selected-organization');
      location.assign('/');
    });
    status.after(button);
    return;
  }
  status.textContent = 'Use o e-mail e a senha da sua conta de organizador.';
  form.hidden = false;
  installPasswordVisibilityToggle(form);
  recovery.hidden = false;
  if (!document.querySelector('#request-access')) {
    const requestAccess = document.createElement('a');
    requestAccess.id = 'request-access'; requestAccess.className = 'text-button';
    requestAccess.href = 'https://wa.me/?text=Olá%2C%20quero%20solicitar%20acesso%20ao%20TR%20Campeonatos.';
    requestAccess.target = '_blank'; requestAccess.rel = 'noopener noreferrer';
    requestAccess.textContent = 'Solicitar acesso pelo WhatsApp';
    recovery.insertAdjacentElement('afterend', requestAccess);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true;
    status.textContent = 'Entrando…';
    const { error } = await client.auth.signInWithPassword({ email: String(fields.get('email') || ''), password: String(fields.get('password') || '') });
    if (error) { status.textContent = error.message; submit.disabled = false; return; }
    location.assign(returnTo);
  });
  recovery.addEventListener('click', async () => {
    const email = String(form.querySelector<HTMLInputElement>('input[name="email"]')?.value || '').trim();
    if (!email) { status.textContent = 'Digite seu e-mail para receber o link de recuperação.'; return; }
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/entrar` });
    status.textContent = error ? error.message : 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';
  });
}

async function accountPage(client: SupabaseClient) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) { location.replace('/entrar?retorno=%2Fminha-conta'); return; }
  client.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || !session) location.replace('/'); });
  const target = mount()!;
  const profileResult = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (profileResult.error || !profileResult.data) { target.textContent = 'Não foi possível carregar seu perfil agora.'; return; }
  const profile = profileResult.data as IdentityProfile;
  const accountName = preferredAccountName(profile, user);
  target.removeAttribute('role');
  target.innerHTML = `<main class="account-main"><div class="account-page-head"><span>CONTA TR CAMPEONATOS</span><h1>Minha conta</h1><p>Seu nome é exibido no cabeçalho enquanto sua sessão estiver válida.</p></div><section class="account-profile-card"><div class="account-profile-identity"><span class="account-profile-avatar" aria-hidden="true">${escapeHtml(accountName.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(accountName)}</strong><span>${escapeHtml(user.email || '')}</span></div></div><form id="account-profile-form"><label>Nome de exibição<input name="display_name" minlength="2" maxlength="80" autocomplete="name" value="${escapeHtml(profile.display_name || '')}" required></label><button class="primary-action" type="submit">Salvar nome</button><p id="account-profile-status" role="status"></p></form><div class="account-profile-links"><a href="/painel">Abrir meu painel →</a><a href="/">Voltar ao início</a></div></section></main>`;
  const form = target.querySelector<HTMLFormElement>('#account-profile-form')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = String(new FormData(form).get('display_name') || '').trim();
    const status = target.querySelector<HTMLElement>('#account-profile-status')!;
    if (displayName.length < 2) { status.textContent = 'Informe um nome de pelo menos dois caracteres.'; return; }
    const button = form.querySelector<HTMLButtonElement>('button')!;
    button.disabled = true;
    const result = await client.from('profiles').update({ display_name: displayName }).eq('id', user.id).select('display_name').single();
    button.disabled = false;
    if (result.error) { status.textContent = 'Não foi possível salvar o nome. Tente novamente.'; return; }
    status.textContent = 'Nome atualizado.';
    target.querySelector<HTMLElement>('.account-profile-identity strong')!.textContent = displayName;
    target.querySelector<HTMLElement>('.account-profile-avatar')!.textContent = displayName.slice(0, 1).toUpperCase();
    window.dispatchEvent(new Event('tr:profile-updated'));
  });
}

async function panelPage(client: SupabaseClient) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) { location.replace(`/entrar?retorno=${encodeURIComponent(location.pathname)}`); return; }
  client.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || !session) location.replace('/'); });
  const target = mount()!;
  const profileResult = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (profileResult.error) throw new Error(profileResult.error.message);
  const profile = profileResult.data as ProfileAuthorization | null;
  if (!approvedOrganizer(profile)) return restrictedPanel(client, profile);
  const memberships = await client.from('organization_members').select('organization_id,role,organizations(id,name)').eq('user_id', user.id);
  if (memberships.error) throw new Error(memberships.error.message);
  const available = (memberships.data || []).map((item: any) => ({ id: item.organization_id as string, name: (item.organizations as any)?.name as string, role: item.role as string }));
  if (!available.length) return organizationSetup(client, user.id);
  const selected = available.find((item) => item.id === sessionStorage.getItem('tr-selected-organization')) || available[0];
  const ctx: Context = { client, user: { id: user.id, email: user.email }, organization: { id: selected.id, name: selected.name }, role: selected.role };
  target.removeAttribute('role');
  target.innerHTML = `<div class="panel-layout"><aside class="panel-side"><a href="/" class="panel-logo"><img src="/assets/official/01_logo_principal_transparente.png" alt="TR Campeonatos"></a><div class="panel-org">${escapeHtml(selected.name)}<small>${escapeHtml(selected.role)}</small></div><nav aria-label="Painel do organizador"><a href="/painel" ${location.pathname === '/painel' ? 'aria-current="page"' : ''}>Visão geral</a><a href="/painel/campeonatos" ${location.pathname.startsWith('/painel/campeonatos') ? 'aria-current="page"' : ''}>Campeonatos</a><a href="/painel/equipes" ${location.pathname.startsWith('/painel/equipes') ? 'aria-current="page"' : ''}>Equipes</a><a href="/minha-conta">Minha conta</a><a href="/campeonatos" target="_blank" rel="noopener noreferrer">Vitrine pública</a><a href="/demonstracao/copa-tr-esports" target="_blank" rel="noopener noreferrer">Demonstração esportiva</a></nav><button id="sign-out" type="button">Sair</button></aside><div class="panel-content"><header class="panel-header"><span>Painel do Organizador</span><div><span>${escapeHtml(preferredAccountName(profile, user))}</span>${available.length > 1 ? `<label>Organização<select id="organization-select">${available.map((item) => `<option value="${item.id}" ${item.id === selected.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}</div></header><main id="panel-main" aria-live="polite">Carregando dados oficiais…</main></div></div>`;
  target.querySelector('#sign-out')?.addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) { window.alert('Não foi possível encerrar a sessão. Tente novamente.'); return; }
    sessionStorage.removeItem('tr-selected-organization');
    location.assign('/');
  });
  target.querySelector<HTMLSelectElement>('#organization-select')?.addEventListener('change', (event) => {
    sessionStorage.setItem('tr-selected-organization', (event.target as HTMLSelectElement).value);
    location.assign('/painel');
  });
  const path = location.pathname;
  if (path === '/painel') return dashboard(ctx);
  if (path === '/painel/equipes') return teamsPage(ctx);
  const teamMatch = /^\/painel\/equipes\/([0-9a-f-]{36})$/i.exec(path);
  if (teamMatch && safeId(teamMatch[1])) return teamHistoryPage(ctx, teamMatch[1]);
  if (path === '/painel/campeonatos') return competitionList(ctx);
  if (path === '/painel/campeonatos/novo') return newCompetition(ctx);
  const match = /^\/painel\/campeonatos\/([0-9a-f-]{36})(?:\/(resultados))?$/i.exec(path);
  if (!match || !safeId(match[1])) { panelMain().innerHTML = '<div class="panel-card">Página não encontrada.</div>'; return; }
  if (match[2]) return resultEditor(ctx, match[1]);
  return competitionDetail(ctx, match[1]);
}

function restrictedPanel(client: SupabaseClient, profile: ProfileAuthorization | null) {
  const target = mount()!;
  const pending = profile?.organizer_status === 'pending';
  const suspended = profile?.organizer_status === 'suspended';
  const message = pending
    ? 'Sua solicitação de acesso como organizador está em análise.'
    : suspended
      ? 'O acesso desta conta como organizador está suspenso. Entre em contato com a plataforma.'
      : 'Esta conta não possui autorização para administrar campeonatos.';
  target.removeAttribute('role');
  target.innerHTML = `<div class="setup-shell"><a href="/"><img src="/assets/official/01_logo_principal_transparente.png" alt="TR Campeonatos"></a><div class="panel-card"><span class="eyebrow">ACESSO RESTRITO</span><h1>Acesso de organizador necessário</h1><p>${message}</p><div class="restricted-actions"><a class="secondary-action" href="/demonstracao">Abrir demonstração</a><button id="restricted-sign-out" class="primary-action" type="button">Sair da conta</button></div></div></div>`;
  target.querySelector('#restricted-sign-out')?.addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (!error) { sessionStorage.removeItem('tr-selected-organization'); location.assign('/'); }
  });
}

const panelMain = () => document.querySelector<HTMLElement>('#panel-main')!;
const panelHeading = (eyebrow: string, title: string, description: string, action = '') => `<div class="panel-heading"><div><span>${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</div>`;
const empty = (title: string, copy: string) => `<div class="panel-card empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div>`;

function organizationSetup(client: SupabaseClient, userId: string) {
  const target = mount()!;
  target.innerHTML = `<div class="setup-shell"><a href="/"><img src="/assets/official/01_logo_principal_transparente.png" alt="TR Campeonatos"></a><div class="panel-card"><span class="eyebrow">PRIMEIRO ACESSO</span><h1>Crie sua organização</h1><p>Campeonatos oficiais ficam vinculados à sua organização. Você será o proprietário.</p><form id="organization-form"><label>Nome da organização<input name="name" minlength="2" maxlength="100" required></label><button class="primary-action">Criar organização</button></form><p id="setup-message" role="status"></p></div></div>`;
  target.querySelector<HTMLFormElement>('#organization-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget as HTMLFormElement).get('name') || '').trim();
    const unique = Math.random().toString(36).slice(2, 8);
    const { error } = await client.from('organizations').insert({ name, slug: `${slug(name)}-${unique}`, created_by: userId });
    if (error) target.querySelector<HTMLElement>('#setup-message')!.textContent = error.message;
    else location.assign('/painel');
  });
}

const safePanelReturn = (value: string | null) => value && /^\/painel\/campeonatos\/[0-9a-f-]{36}\/resultados(?:\?[^\s]*)?$/i.test(value) ? value : null;

async function teamCrestUrls(client: SupabaseClient, teams: any[]) {
  const pairs = await Promise.all(teams.map(async (team) => {
    if (!team.crest_path) return [team.id, null] as const;
    const result = await client.storage.from('club-crests').createSignedUrl(team.crest_path, 900);
    return [team.id, result.error ? null : result.data.signedUrl] as const;
  }));
  return new Map(pairs);
}

async function teamsPage(ctx: Context) {
  const result = await ctx.client.from('clubs').select('id,official_name,crest_path,status,created_at,updated_at').eq('organization_id', ctx.organization.id).order('updated_at', { ascending: false });
  fail(result.error);
  const teams = result.data || [];
  const crestUrls = await teamCrestUrls(ctx.client, teams);
  const returnTo = safePanelReturn(new URLSearchParams(location.search).get('retorno'));
  const createForm = editor(ctx.role) ? `<section class="panel-card team-create-card"><div><span class="eyebrow">BANCO PERMANENTE</span><h2>Cadastrar equipe</h2><p>A equipe continua disponível mesmo após o fim de um campeonato.</p></div><form id="team-create-form" class="team-create-form"><label>Nome da equipe<input name="name" minlength="2" maxlength="100" required></label><label>Escudo da equipe<input name="crest" type="file" accept="image/png,image/jpeg,image/webp" required></label><p class="form-hint">PNG, JPG, JPEG ou WEBP · até 3 MB. O TR Smart Shield preserva o original e só remove o fundo quando for seguro.</p><button class="primary-action" type="submit">Salvar equipe</button><p role="status"></p></form></section>` : '';
  const cards = teams.map((team) => {
    const crest = crestUrls.get(team.id) || null;
    const archived = team.status === 'archived';
    return `<article class="team-directory-card" data-team-name="${escapeHtml(normalizeTeamSearch(team.official_name))}" data-team-status="${escapeHtml(team.status)}"><div class="team-directory-crest">${teamShieldMarkup(crest, team.official_name, 'medium')}</div><div class="team-directory-copy"><span class="pill">${archived ? 'Arquivada' : 'Ativa'}</span><h2>${escapeHtml(team.official_name)}</h2><p>Identidade permanente da organização.</p></div><div class="team-directory-actions"><a class="secondary-action" href="/painel/equipes/${team.id}">Histórico</a>${editor(ctx.role) ? `<button class="text-button team-edit-toggle" type="button" data-team-id="${team.id}">Editar</button><button class="text-button team-archive" type="button" data-team-id="${team.id}" data-next-status="${archived ? 'pending' : 'archived'}">${archived ? 'Reativar' : 'Arquivar'}</button>` : ''}</div>${editor(ctx.role) ? `<form class="team-edit-form" data-team-id="${team.id}" hidden><label>Nome da equipe<input name="name" minlength="2" maxlength="100" value="${escapeHtml(team.official_name)}" required></label><label>Novo escudo <small>(opcional)</small><input name="crest" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="secondary-action">Salvar alterações</button><p role="status"></p></form>` : ''}</article>`;
  }).join('');
  panelMain().innerHTML = `${panelHeading('EQUIPES', 'Banco de equipes', 'Cadastre uma vez e selecione em quantas temporadas forem necessárias.', returnTo ? `<a class="secondary-action" href="${escapeHtml(returnTo)}">← Voltar à seleção</a>` : '')}${createForm}<section class="panel-card team-directory"><div class="card-head"><div><h2>Suas equipes</h2><p>${teams.length} ${teams.length === 1 ? 'equipe cadastrada' : 'equipes cadastradas'}</p></div><label class="team-search-label">Buscar equipe<input id="team-directory-search" type="search" placeholder="Digite um nome" autocomplete="off"></label></div><p id="team-directory-empty" class="data-note" ${teams.length ? 'hidden' : ''}>Nenhuma equipe cadastrada nesta organização.</p><div id="team-directory-list" class="team-directory-list">${cards}</div><p id="team-search-empty" class="data-note" hidden>Nenhuma equipe encontrada.</p></section>`;
  const search = panelMain().querySelector<HTMLInputElement>('#team-directory-search');
  const applySearch = () => {
    const needle = normalizeTeamSearch(search?.value || ''); let visible = 0;
    panelMain().querySelectorAll<HTMLElement>('.team-directory-card').forEach((card) => { const show = !needle || (card.dataset.teamName || '').includes(needle); card.hidden = !show; if (show) visible += 1; });
    const empty = panelMain().querySelector<HTMLElement>('#team-search-empty'); if (empty) empty.hidden = visible > 0 || !teams.length;
  };
  search?.addEventListener('input', applySearch);
  if (!editor(ctx.role)) return;
  panelMain().querySelector<HTMLFormElement>('#team-create-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement, data = new FormData(form), name = String(data.get('name') || '').trim(), crest = data.get('crest');
    const message = form.querySelector<HTMLElement>('[role="status"]')!;
    if (name.length < 2 || !(crest instanceof File) || !crest.size) { message.textContent = 'Informe o nome e o escudo da equipe.'; return; }
    let prepared: SmartShieldResult;
    try { message.textContent = 'Validando o escudo…'; prepared = await prepareSmartShield(crest); }
    catch (error) { message.textContent = error instanceof Error ? error.message : 'Não foi possível validar o escudo.'; return; }
    const submit = form.querySelector<HTMLButtonElement>('button')!; submit.disabled = true;
    const created = await ctx.client.from('clubs').insert({ official_name: name, slug: `${slug(name)}-${Math.random().toString(36).slice(2, 8)}`, sport: 'Futebol', organization_id: ctx.organization.id, created_by: ctx.user.id, status: 'pending' }).select('id').single();
    if (created.error) { message.textContent = created.error.message.includes('clubs_organization_name_active_unique') ? 'Já existe uma equipe com esse nome nesta organização.' : created.error.message; submit.disabled = false; return; }
    try {
      const saved = await storeSmartShield(ctx.client, created.data.id, crest, prepared);
      message.textContent = saved.notice;
      location.assign(returnTo || '/painel/equipes');
    } catch (error) { message.textContent = error instanceof Error ? error.message : 'Equipe criada, mas o escudo não foi salvo.'; submit.disabled = false; }
  });
  panelMain().querySelectorAll<HTMLButtonElement>('.team-edit-toggle').forEach((button) => button.addEventListener('click', () => {
    const form = panelMain().querySelector<HTMLFormElement>(`.team-edit-form[data-team-id="${button.dataset.teamId}"]`); if (form) form.hidden = !form.hidden;
  }));
  panelMain().querySelectorAll<HTMLButtonElement>('.team-archive').forEach((button) => button.addEventListener('click', async () => {
    const teamId = button.dataset.teamId || '', next = button.dataset.nextStatus || 'archived';
    if (!safeId(teamId) || !window.confirm(next === 'archived' ? 'Arquivar esta equipe? O histórico não será apagado.' : 'Reativar esta equipe?')) return;
    button.disabled = true;
    const updated = await ctx.client.from('clubs').update({ status: next }).eq('id', teamId).eq('organization_id', ctx.organization.id);
    if (updated.error) { window.alert(updated.error.message); button.disabled = false; } else location.reload();
  }));
  panelMain().querySelectorAll<HTMLFormElement>('.team-edit-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const teamId = form.dataset.teamId || '', data = new FormData(form), name = String(data.get('name') || '').trim(), crest = data.get('crest'), message = form.querySelector<HTMLElement>('[role="status"]')!;
    if (!safeId(teamId) || name.length < 2) { message.textContent = 'Informe um nome válido.'; return; }
    const update = await ctx.client.from('clubs').update({ official_name: name }).eq('id', teamId).eq('organization_id', ctx.organization.id);
    if (update.error) { message.textContent = update.error.message; return; }
    if (crest instanceof File && crest.size) {
      try { message.textContent = 'Atualizando o escudo…'; await storeSmartShield(ctx.client, teamId, crest); }
      catch (error) { message.textContent = error instanceof Error ? error.message : 'Nome salvo, mas o escudo não foi atualizado.'; return; }
    }
    location.reload();
  }));
}

async function teamHistoryPage(ctx: Context, id: string) {
  const clubResult = await ctx.client.from('clubs').select('id,official_name,crest_path,status,created_at').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
  fail(clubResult.error); const club = clubResult.data;
  if (!club) { panelMain().innerHTML = empty('Equipe não encontrada', 'Ela não pertence a esta organização ou não está disponível.'); return; }
  const entriesResult = await ctx.client.from('competition_entries').select('id,season_id,final_position,final_phase,status').eq('club_id', id).order('registered_at', { ascending: false });
  fail(entriesResult.error); const entries = entriesResult.data || [], entryIds = new Set(entries.map((entry) => entry.id)), seasonIds = [...new Set(entries.map((entry) => entry.season_id))];
  const [seasonResult, titleResult, matchResult, crestUrls] = await Promise.all([
    seasonIds.length ? ctx.client.from('competition_seasons').select('id,label,competition:competitions(id,name,sport,organization_id)').in('id', seasonIds) : Promise.resolve({ data: [], error: null } as any),
    seasonIds.length ? ctx.client.from('competition_titles').select('season_id,place,title_type').eq('club_id', id).in('season_id', seasonIds) : Promise.resolve({ data: [], error: null } as any),
    seasonIds.length ? ctx.client.from('matches').select('id,season_id,scheduled_at,home_entry_id,away_entry_id,home_score,away_score,status').in('season_id', seasonIds).eq('status', 'confirmed').order('scheduled_at', { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [], error: null } as any),
    teamCrestUrls(ctx.client, [club]),
  ]);
  fail(seasonResult.error); fail(titleResult.error); fail(matchResult.error);
  const seasons = new Map((seasonResult.data || []).filter((season: any) => season.competition?.organization_id === ctx.organization.id).map((season: any) => [season.id, season]));
  const ownEntries = entries.filter((entry) => seasons.has(entry.season_id));
  const ownEntryIds = new Set(ownEntries.map((entry) => entry.id));
  const matches = (matchResult.data || []).filter((match: any) => ownEntryIds.has(match.home_entry_id) || ownEntryIds.has(match.away_entry_id));
  const summary = matches.reduce((stats: any, match: any) => { const home = ownEntryIds.has(match.home_entry_id), scored = home ? match.home_score : match.away_score, conceded = home ? match.away_score : match.home_score; stats.played += 1; stats.scored += scored; stats.conceded += conceded; if (scored > conceded) stats.wins += 1; else if (scored === conceded) stats.draws += 1; else stats.losses += 1; return stats; }, { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 });
  const titles = (titleResult.data || []).filter((title: any) => seasons.has(title.season_id));
  const crest = crestUrls.get(club.id) || null;
  const historyRows = ownEntries.map((entry) => { const season: any = seasons.get(entry.season_id); return `<article class="history-row"><strong>${escapeHtml(season?.competition?.name || 'Competição registrada')}</strong><span>${escapeHtml(season?.label || 'Temporada')} · ${entry.final_position ? `${entry.final_position}º lugar` : entry.final_phase ? escapeHtml(entry.final_phase) : 'Participação confirmada'}</span></article>`; }).join('');
  const matchRows = matches.slice(0, 12).map((match: any) => { const home = ownEntryIds.has(match.home_entry_id), score = home ? `${match.home_score} × ${match.away_score}` : `${match.away_score} × ${match.home_score}`, season: any = seasons.get(match.season_id); return `<article class="history-row"><strong>${escapeHtml(season?.competition?.name || 'Partida confirmada')}</strong><span>${score} · ${escapeHtml(readableDate(match.scheduled_at))}</span></article>`; }).join('');
  panelMain().innerHTML = `${panelHeading('HISTÓRICO DA EQUIPE', club.official_name, 'Dados calculados exclusivamente de registros oficiais confirmados.', '<a class="secondary-action" href="/painel/equipes">← Equipes</a>')}<section class="panel-card team-history-hero"><div>${teamShieldMarkup(crest, club.official_name, 'hero', 'eager')}</div><div><span class="pill">${club.status === 'archived' ? 'Arquivada' : 'Ativa'}</span><h2>${escapeHtml(club.official_name)}</h2><p>Cadastrada em ${escapeHtml(readableDate(club.created_at))}</p></div></section><section class="team-history-metrics">${[['Campeonatos', ownEntries.length], ['Partidas', summary.played], ['Vitórias', summary.wins], ['Empates', summary.draws], ['Derrotas', summary.losses], ['Gols pró', summary.scored], ['Gols contra', summary.conceded]].map(([label, value]) => `<article class="panel-card metric"><span>${label}</span><strong>${value}</strong></article>`).join('')}</section>${historyRows ? `<section class="panel-card"><h2>Campeonatos disputados</h2>${historyRows}</section>` : ''}${matchRows ? `<section class="panel-card"><h2>Partidas e resultados</h2>${matchRows}</section>` : ''}${titles.length ? `<section class="panel-card"><h2>Conquistas registradas</h2>${titles.map((title: any) => { const season: any = seasons.get(title.season_id); return `<div class="history-row"><strong>${title.place === 1 ? 'Campeão' : title.place === 2 ? 'Vice-campeão' : `${title.place}º lugar`}</strong><span>${escapeHtml(season?.competition?.name || 'Competição registrada')}</span></div>`; }).join('')}</section>` : ''}${!historyRows && !matchRows && !titles.length ? empty('Histórico em construção', 'A trajetória aparecerá automaticamente quando houver participações e resultados oficiais confirmados.') : ''}`;
}

async function organizationCompetitions(ctx: Context) {
  const result = await ctx.client.from('competitions').select('id,name,sport,status,visibility,updated_at').eq('organization_id', ctx.organization.id).order('updated_at', { ascending: false });
  fail(result.error);
  return result.data || [];
}

async function dashboard(ctx: Context) {
  const competitions = await organizationCompetitions(ctx);
  const ids = competitions.map((item) => item.id);
  let entries: any[] = [], matches: any[] = [], seasons: any[] = [];
  if (ids.length) {
    const seasonQuery = await ctx.client.from('competition_seasons').select('id,competition_id,status').in('competition_id', ids);
    fail(seasonQuery.error); seasons = seasonQuery.data || [];
    if (seasons.length) {
      const seasonIds = seasons.map((item) => item.id);
      const [entryQuery, matchQuery] = await Promise.all([
        ctx.client.from('competition_entries').select('id,club_id,club_name_snapshot').in('season_id', seasonIds),
        ctx.client.from('matches').select('id,season_id,home_entry_id,away_entry_id,status,home_score,away_score,scheduled_at').in('season_id', seasonIds),
      ]);
      fail(entryQuery.error); fail(matchQuery.error);
      entries = entryQuery.data || []; matches = matchQuery.data || [];
    }
  }
  const confirmed = matches.filter((match) => match.status === 'confirmed');
  const upcoming = matches.filter((match) => match.status === 'scheduled' && match.scheduled_at && new Date(match.scheduled_at).getTime() >= Date.now()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const metrics = [
    ['Campeonatos ativos', competitions.filter((item) => item.status === 'active').length],
    ['Equipes participantes', new Set(entries.map((entry) => entry.club_id)).size],
    ['Jogadores', '—'], ['Partidas confirmadas', confirmed.length],
    ['Próximos confrontos', upcoming.length],
    ['Pontos ou gols registrados', confirmed.reduce((sum, match) => sum + Number(match.home_score || 0) + Number(match.away_score || 0), 0)],
    ['Temporadas encerradas', seasons.filter((season) => season.status === 'completed').length],
  ];
  const featuredCompetition = competitions.find((item) => item.status === 'active');
  const featuredSeasonIds = new Set(seasons.filter((season) => season.competition_id === featuredCompetition?.id).map((season) => season.id));
  const featuredMatches = matches.filter((match) => featuredSeasonIds.has(match.season_id));
  const entryNames = new Map(entries.map((entry) => [entry.id, entry.club_name_snapshot]));
  const nextMatch = featuredMatches.filter((match) => match.status === 'scheduled' && match.scheduled_at && new Date(match.scheduled_at).getTime() >= Date.now()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  const lastMatch = featuredMatches.filter((match) => match.status === 'confirmed').sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || ''))[0];
  const pairing = (match: any) => `${escapeHtml(entryNames.get(match.home_entry_id) || 'Equipe indisponível')} × ${escapeHtml(entryNames.get(match.away_entry_id) || 'Equipe indisponível')}`;
  const featuredHtml = featuredCompetition ? `<section class="panel-card featured-competition"><div><span>CAMPEONATO EM DESTAQUE</span><h2>${escapeHtml(featuredCompetition.name)}</h2><p>${escapeHtml(featuredCompetition.sport)} · ${featuredCompetition.visibility === 'public' ? 'Publicado' : 'Privado'}</p><a href="/painel/campeonatos/${featuredCompetition.id}">Gerenciar campeonato →</a>${featuredCompetition.visibility === 'public' ? `<a href="/c/${featuredCompetition.id}" target="_blank" rel="noopener noreferrer">Abrir portal público →</a>` : ''}</div><div class="featured-results"><div><small>PRÓXIMO CONFRONTO</small><strong>${nextMatch ? pairing(nextMatch) : 'Nenhum confronto agendado'}</strong><span>${nextMatch ? escapeHtml(readableDate(nextMatch.scheduled_at)) : 'Cadastre a próxima partida no campeonato.'}</span></div><div><small>ÚLTIMO RESULTADO</small><strong>${lastMatch ? pairing(lastMatch) : 'Nenhum resultado confirmado'}</strong><span>${lastMatch ? `${lastMatch.home_score} × ${lastMatch.away_score}` : 'Os resultados aparecerão após a confirmação.'}</span></div></div></section>` : '';
  panelMain().innerHTML = `${panelHeading('DADOS OFICIAIS', 'Visão geral', `Organização: ${ctx.organization.name}`, editor(ctx.role) ? '<a class="primary-action" href="/painel/campeonatos/novo">Criar campeonato</a>' : '')}<div class="metric-grid">${metrics.map(([label, value]) => `<article class="panel-card metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('')}</div>${featuredHtml}<p class="data-note">O cadastro de jogadores ainda não existe no esquema atual; por isso nenhum total é estimado.</p><div class="panel-card"><div class="card-head"><h2>Suas competições</h2><a href="/painel/campeonatos">Ver todas →</a></div>${competitions.length ? `<div class="list-links">${competitions.slice(0, 5).map((item) => `<a href="/painel/campeonatos/${item.id}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.sport)} · ${escapeHtml(item.status)}</span></a>`).join('')}</div>` : '<p>Nenhuma competição cadastrada nesta organização.</p>'}</div>`;
}

async function competitionList(ctx: Context) {
  const competitions = await organizationCompetitions(ctx);
  panelMain().innerHTML = `${panelHeading('GESTÃO DE COMPETIÇÕES', 'Campeonatos', 'Somente competições vinculadas à sua organização.', editor(ctx.role) ? '<a class="primary-action" href="/painel/campeonatos/novo">Novo campeonato</a>' : '')}${competitions.length ? `<div class="competition-grid">${competitions.map((item) => `<article class="panel-card competition-card"><span class="pill">${escapeHtml(item.status)}</span><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.sport)} · ${item.visibility === 'public' ? 'Público' : 'Privado'}</p><a href="/painel/campeonatos/${item.id}">Gerenciar →</a>${item.visibility === 'public' ? `<a href="/c/${item.id}" target="_blank" rel="noopener noreferrer">Ver página pública →</a>` : ''}</article>`).join('')}</div>` : empty('Nenhum campeonato cadastrado', 'Crie a primeira competição para começar a organizar suas temporadas.')}`;
}

function newCompetition(ctx: Context) {
  if (!editor(ctx.role)) { panelMain().innerHTML = empty('Acesso restrito', 'Sua função nesta organização permite apenas visualizar competições.'); return; }
  panelMain().innerHTML = `${panelHeading('NOVA COMPETIÇÃO', 'Criar campeonato', 'Os dados serão gravados na sua organização e ficarão privados por padrão.')}<div class="panel-card form-card"><form id="new-competition"><label>Nome do campeonato<input name="name" minlength="3" maxlength="120" required></label><label>Modalidade<select name="sport"><option>Futebol</option><option>Futsal</option><option>Vôlei</option><option>Basquete</option><option>E-sports</option></select></label><label>Temporada<input name="season" minlength="2" maxlength="40" placeholder="Ex.: 2026" required></label><label>Formato<select name="format"><option value="round_robin">Pontos corridos</option><option value="knockout">Mata-mata</option><option value="groups_knockout">Grupos e mata-mata</option></select></label><p class="data-note">A competição começará como rascunho privado. A publicação pode ser configurada depois.</p><button class="primary-action" type="submit">Criar campeonato</button><p id="form-message" role="status"></p></form></div>`;
  panelMain().querySelector('.form-card')?.insertAdjacentHTML('beforebegin', '<div class="panel-card"><h2>Analise o formato antes do cadastro</h2><p>Informe a quantidade de equipes no planejador para ver partidas, rodadas, folgas e restrições do Corujão. A análise não cria dados oficiais.</p><a class="secondary-action" href="/planejador" target="_blank" rel="noopener noreferrer">Abrir planejador de formatos ↗</a></div>');
  const formatSelect = panelMain().querySelector<HTMLSelectElement>('#new-competition select[name="format"]')!;
  formatSelect.querySelector<HTMLOptionElement>('option[value="knockout"]')!.textContent = 'Mata-mata · agenda manual';
  formatSelect.querySelector<HTMLOptionElement>('option[value="groups_knockout"]')!.textContent = 'Grupos + mata-mata · agenda manual';
  const formatNote = document.createElement('p');
  formatNote.className = 'data-note';
  formatNote.id = 'format-capability';
  formatSelect.closest('label')?.after(formatNote);
  const describeFormat = () => { formatNote.textContent = formatSelect.value === 'round_robin' ? 'O motor calcula pontos corridos. Cadastre participantes antes de gerar a agenda oficial.' : 'Este formato pode ser registrado como rascunho, mas grupos, classificados e chaveamento automático ainda não estão integrados ao banco. As partidas são cadastradas manualmente.'; };
  formatSelect.addEventListener('change', describeFormat);
  describeFormat();
  panelMain().querySelector<HTMLFormElement>('#new-competition')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    const name = String(fields.get('name') || '').trim();
    const label = String(fields.get('season') || '').trim();
    const sport = String(fields.get('sport') || '');
    const format = String(fields.get('format') || '');
    const message = panelMain().querySelector<HTMLElement>('#form-message')!;
    if (name.length < 3 || label.length < 2) { message.textContent = 'Confira o nome e a temporada.'; return; }
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true; message.textContent = 'Criando campeonato…';
    const created = await ctx.client.rpc('create_competition_with_season', { target_organization: ctx.organization.id, target_name: name, target_sport: sport, target_season_label: label, target_format: format });
    if (created.error) { message.textContent = created.error.message; submit.disabled = false; return; }
    location.assign(`/painel/campeonatos/${created.data.id}`);
  });
}

async function getCompetition(ctx: Context, id: string) {
  const result = await ctx.client.from('competitions').select('id,name,sport,status,visibility,organization_id').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
  fail(result.error);
  return result.data;
}

async function competitionDetail(ctx: Context, id: string) {
  const competition = await getCompetition(ctx, id);
  if (!competition) { panelMain().innerHTML = empty('Campeonato não encontrado', 'Confira o endereço ou a permissão da sua conta.'); return; }
  const seasonsQuery = await ctx.client.from('competition_seasons').select('id,label,format,status,starts_on,ends_on').eq('competition_id', id).order('created_at', { ascending: false });
  fail(seasonsQuery.error);
  const seasons = seasonsQuery.data || [];
  panelMain().innerHTML = `${panelHeading('CAMPEONATO', competition.name, `${competition.sport} · ${competition.status} · ${competition.visibility === 'public' ? 'Público' : 'Privado'}`, competition.visibility === 'public' ? `<a class="secondary-action" href="/c/${id}" target="_blank" rel="noopener noreferrer">Abrir página pública</a>` : '')}<div class="panel-card"><div class="card-head"><h2>Temporadas</h2>${editor(ctx.role) ? '<button id="show-season-form" class="secondary-action" type="button">Adicionar temporada</button>' : ''}</div>${seasons.length ? `<div class="list-links">${seasons.map((season) => `<div><strong>${escapeHtml(season.label)}</strong><span>${escapeHtml(season.format)} · ${escapeHtml(season.status)}</span><a href="/painel/campeonatos/${id}/resultados?temporada=${season.id}">Partidas e resultados →</a></div>`).join('')}</div>` : '<p>Nenhuma temporada cadastrada.</p>'}<form id="season-form" hidden><label>Nome da temporada<input name="label" minlength="2" maxlength="40" required></label><label>Formato<select name="format"><option value="round_robin">Pontos corridos</option><option value="knockout">Mata-mata</option><option value="groups_knockout">Grupos e mata-mata</option></select></label><button class="primary-action" type="submit">Salvar temporada</button><p role="status"></p></form></div><div class="panel-card"><h2>Ações da competição</h2><div class="action-links"><a href="/painel/campeonatos/${id}/resultados">Editar resultados</a>${competition.visibility === 'public' ? `<button id="copy-public-link" class="secondary-action" type="button">Copiar link público</button><span id="copy-public-status" role="status"></span>` : '<span>Publicação: privada</span>'}</div></div>`;
  panelMain().querySelector('#copy-public-link')?.addEventListener('click', async () => {
    const publicUrl = `${location.origin}/c/${id}`;
    const status = panelMain().querySelector<HTMLElement>('#copy-public-status')!;
    try { await navigator.clipboard.writeText(publicUrl); status.textContent = 'Link público copiado.'; }
    catch { status.textContent = `Copie este endereço: ${publicUrl}`; }
  });  if (editor(ctx.role)) {
    panelMain().insertAdjacentHTML('beforeend', `<div class="panel-card"><h2>Visibilidade</h2><p>${competition.visibility === 'public' ? 'Esta competição está visível para visitantes.' : 'Esta competição está privada. Para publicar, cadastre uma temporada com duas equipes confirmadas e ao menos uma partida.'}</p><button id="toggle-publication" class="secondary-action" type="button">${competition.visibility === 'public' ? 'Tornar privada' : 'Publicar campeonato'}</button><p id="publication-status" role="status"></p></div>`);
    panelMain().querySelector('#toggle-publication')?.addEventListener('click', async () => {
      if (competition.visibility !== 'public' && !seasons.length) { panelMain().querySelector<HTMLElement>('#publication-status')!.textContent = 'Crie uma temporada antes de publicar.'; return; }
      const makePublic = competition.visibility !== 'public';
      if (!window.confirm(makePublic ? 'Publicar esta competição e seus dados para visitantes?' : 'Retirar esta competição da vitrine pública?')) return;
      const result = await ctx.client.rpc('set_competition_publication', { target_competition: id, make_public: makePublic });
      if (result.error) panelMain().querySelector<HTMLElement>('#publication-status')!.textContent = result.error.message;
      else location.reload();
    });
  }
  panelMain().querySelector('#show-season-form')?.addEventListener('click', () => { panelMain().querySelector<HTMLFormElement>('#season-form')!.hidden = false; });
  panelMain().querySelector<HTMLFormElement>('#season-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    const result = await ctx.client.from('competition_seasons').insert({ competition_id: id, label: String(fields.get('label') || '').trim(), format: fields.get('format'), status: 'draft' });
    if (result.error) form.querySelector<HTMLElement>('[role="status"]')!.textContent = result.error.message;
    else location.reload();
  });
}

async function resultEditor(ctx: Context, id: string) {
  const competition = await getCompetition(ctx, id);
  if (!competition) { panelMain().innerHTML = empty('Campeonato não encontrado', 'Confira o endereço ou a permissão da sua conta.'); return; }
  const seasonResult = await ctx.client.from('competition_seasons').select('id,label').eq('competition_id', id).order('created_at', { ascending: false });
  fail(seasonResult.error);
  const seasons = seasonResult.data || [];
  const requested = new URLSearchParams(location.search).get('temporada');
  const selected = seasons.find((season) => season.id === requested) || seasons[0];
  if (!selected) { panelMain().innerHTML = `${panelHeading('RESULTADOS', competition.name, 'Nenhuma temporada cadastrada.')}<a class="secondary-action" href="/painel/campeonatos/${id}">Voltar ao campeonato</a>`; return; }
  const [entryResult, matchResult] = await Promise.all([
    ctx.client.from('competition_entries').select('id,club_id,club_name_snapshot,status').eq('season_id', selected.id),
    ctx.client.from('matches').select('id,phase,round_number,scheduled_at,home_entry_id,away_entry_id,home_score,away_score,status').eq('season_id', selected.id).order('scheduled_at', { ascending: true, nullsFirst: false }),
  ]);
  fail(entryResult.error); fail(matchResult.error);
  const entries = entryResult.data || [];
  const matches = matchResult.data || [];
  const penaltyResult = matches.length ? await ctx.client.from('penalty_shootouts').select('match_id,home_score,away_score,winning_entry_id').in('match_id', matches.map((match) => match.id)) : null;
  if (penaltyResult) fail(penaltyResult.error);
  const penaltiesByMatch = new Map((penaltyResult?.data || []).map((item) => [item.match_id, item]));
  const names = new Map(entries.map((entry) => [entry.id, entry.club_name_snapshot]));
  panelMain().innerHTML = `${panelHeading('CENTRAL DE PARTIDAS', competition.name, `Temporada ${selected.label} · resultados oficiais`)}<div class="panel-card"><div class="filter-row"><label>Temporada<select id="season-select">${seasons.map((season) => `<option value="${season.id}" ${season.id === selected.id ? 'selected' : ''}>${escapeHtml(season.label)}</option>`).join('')}</select></label><label>Situação<select id="status-filter"><option value="">Todas</option><option value="scheduled">Agendadas</option><option value="in_progress">Em andamento</option><option value="completed">Finalizadas</option><option value="confirmed">Confirmadas</option></select></label><label>Rodada<input id="round-filter" type="number" min="1" placeholder="Todas"></label><label>Equipe<select id="team-filter"><option value="">Todas</option>${entries.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.club_name_snapshot)}</option>`).join('')}</select></label><label>Fase<select id="phase-filter"><option value="">Todas</option><option value="league">Liga</option><option value="groups">Grupos</option><option value="round_of_16">Oitavas</option><option value="quarterfinal">Quartas</option><option value="semifinal">Semifinal</option><option value="final">Final</option></select></label><label>Data<input id="date-filter" type="date"></label></div></div><div id="match-list">${matches.length ? matches.map((match) => `<article class="panel-card match-row" data-status="${match.status}" data-round="${match.round_number ?? ''}" data-phase="${match.phase}" data-date="${match.scheduled_at?.slice(0, 10) || ''}" data-home="${match.home_entry_id}" data-away="${match.away_entry_id}"><div class="match-meta"><span>${escapeHtml(match.phase)} · Rodada ${match.round_number ?? '—'}</span><span>${escapeHtml(readableDate(match.scheduled_at))}</span><span class="pill">${escapeHtml(match.status)}</span></div><form data-match-id="${match.id}"><strong>${escapeHtml(names.get(match.home_entry_id) || 'Equipe indisponível')}</strong><input aria-label="Gols do mandante" name="home" type="number" min="0" max="32767" value="${match.home_score ?? ''}" required ${editor(ctx.role) ? '' : 'disabled'}><b>×</b><input aria-label="Gols do visitante" name="away" type="number" min="0" max="32767" value="${match.away_score ?? ''}" required ${editor(ctx.role) ? '' : 'disabled'}><strong>${escapeHtml(names.get(match.away_entry_id) || 'Equipe indisponível')}</strong><select name="status" aria-label="Situação do resultado" ${editor(ctx.role) ? '' : 'disabled'}><option value="completed" ${match.status === 'completed' ? 'selected' : ''}>Finalizado</option><option value="confirmed" ${match.status === 'confirmed' ? 'selected' : ''}>Confirmado</option></select>${editor(ctx.role) ? '<button class="primary-action" type="submit">Salvar</button>' : ''}</form><p role="status"></p></article>`).join('') : empty('Nenhuma partida cadastrada', 'Cadastre equipes e partidas para lançar resultados.')}</div>${editor(ctx.role) ? `<div class="panel-card"><h2>Adicionar equipe existente</h2><form id="entry-form"><label>Clube<select name="club" id="club-select" required><option value="">Carregando clubes…</option></select></label><button class="secondary-action">Adicionar à temporada</button><p role="status"></p></form></div><div class="panel-card"><h2>Agendar partida</h2><form id="match-form" class="fixture-form"><label>Mandante<select name="home" required>${entries.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.club_name_snapshot)}</option>`).join('')}</select></label><label>Visitante<select name="away" required>${entries.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.club_name_snapshot)}</option>`).join('')}</select></label><label>Rodada<input name="round" type="number" min="1" required></label><label>Data e horário<input name="date" type="datetime-local"></label><button class="primary-action" ${entries.length < 2 ? 'disabled' : ''}>Agendar</button><p role="status"></p></form></div>` : ''}`;
  panelMain().querySelector('#match-list')?.insertAdjacentHTML('beforebegin', `<div class="panel-card"><h2>Montar estrutura</h2><p>Use as ${entries.length} equipes confirmadas desta temporada para sortear grupos e visualizar confrontos. Esta prévia não altera os resultados oficiais.</p><a class="secondary-action" href="/planejador?temporada=${encodeURIComponent(selected.id)}">Abrir planejador com estas equipes →</a></div>`);
  panelMain().querySelector<HTMLSelectElement>('#season-select')!.addEventListener('change', (event) => { location.assign(`?temporada=${(event.target as HTMLSelectElement).value}`); });
  const filter = () => {
    const status = panelMain().querySelector<HTMLSelectElement>('#status-filter')!.value;
    const round = panelMain().querySelector<HTMLInputElement>('#round-filter')!.value;
    const team = panelMain().querySelector<HTMLSelectElement>('#team-filter')!.value;
    const phase = panelMain().querySelector<HTMLSelectElement>('#phase-filter')!.value;
    const date = panelMain().querySelector<HTMLInputElement>('#date-filter')!.value;
    panelMain().querySelectorAll<HTMLElement>('.match-row').forEach((row) => { row.hidden = Boolean((status && row.dataset.status !== status) || (round && row.dataset.round !== round) || (team && row.dataset.home !== team && row.dataset.away !== team) || (phase && row.dataset.phase !== phase) || (date && row.dataset.date !== date)); });
  };
  ['#status-filter', '#round-filter', '#team-filter', '#phase-filter', '#date-filter'].forEach((selector) => panelMain().querySelector(selector)?.addEventListener('input', filter));
  for (const match of matches) {
    if (match.status !== 'confirmed' || match.home_score !== match.away_score || ['league', 'groups'].includes(match.phase)) continue;
    const row = panelMain().querySelector<HTMLFormElement>(`.match-row form[data-match-id="${match.id}"]`)?.closest('.match-row');
    const penalty = penaltiesByMatch.get(match.id);
    row?.insertAdjacentHTML('beforeend', `<form class="penalty-form" data-penalty-id="${match.id}"><strong>Disputa por pênaltis</strong><label>${escapeHtml(names.get(match.home_entry_id) || 'Mandante')}<input name="home" type="number" min="0" max="32767" value="${penalty?.home_score ?? ''}" required ${editor(ctx.role) ? '' : 'disabled'}></label><span>×</span><label>${escapeHtml(names.get(match.away_entry_id) || 'Visitante')}<input name="away" type="number" min="0" max="32767" value="${penalty?.away_score ?? ''}" required ${editor(ctx.role) ? '' : 'disabled'}></label>${editor(ctx.role) ? '<button class="secondary-action" type="submit">Salvar pênaltis</button>' : ''}<p role="status"></p></form>`);
  }
  panelMain().querySelectorAll<HTMLFormElement>('.match-row form[data-match-id]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editor(ctx.role)) return;
    const fields = new FormData(form);
    const home = Number(fields.get('home')), away = Number(fields.get('away'));
    const message = form.nextElementSibling as HTMLElement;
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) { message.textContent = 'Informe placares inteiros e não negativos.'; return; }
    const submit = form.querySelector<HTMLButtonElement>('button')!; submit.disabled = true;
    const result = await ctx.client.rpc('set_match_result', { target_match: form.dataset.matchId, target_home_score: home, target_away_score: away, target_status: fields.get('status') });
    if (result.error) { message.textContent = result.error.message; submit.disabled = false; }
    else { message.textContent = 'Resultado salvo e auditado.'; setTimeout(() => location.reload(), 500); }
  }));
  panelMain().querySelectorAll<HTMLFormElement>('.penalty-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editor(ctx.role)) return;
    const fields = new FormData(form);
    const home = Number(fields.get('home')), away = Number(fields.get('away'));
    const message = form.querySelector<HTMLElement>('[role="status"]')!;
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home === away) { message.textContent = 'Informe placares válidos com um vencedor.'; return; }
    const submit = form.querySelector<HTMLButtonElement>('button')!;
    submit.disabled = true; message.textContent = 'Salvando pênaltis…';
    const result = await ctx.client.rpc('set_penalty_shootout', { target_match: form.dataset.penaltyId, target_home_score: home, target_away_score: away });
    if (result.error) { message.textContent = result.error.message; submit.disabled = false; }
    else { message.textContent = 'Disputa por pênaltis salva.'; setTimeout(() => location.reload(), 500); }
  }));
  if (editor(ctx.role)) {
    const entryPanel = panelMain().querySelector<HTMLFormElement>('#entry-form')?.closest('.panel-card');
    if (entryPanel) entryPanel.innerHTML = `<h2>Selecionar equipes participantes</h2><p>Pesquise no banco permanente da sua organização e adicione cada equipe uma única vez.</p><label>Buscar equipe<input id="club-search" type="search" placeholder="Ex.: A, AR, ARE" autocomplete="off"></label><div id="club-search-results" class="team-select-results"></div><a class="secondary-action" href="/painel/equipes?retorno=${encodeURIComponent(`/painel/campeonatos/${id}/resultados?temporada=${selected.id}`)}">Cadastrar nova equipe</a><p id="entry-search-status" role="status"></p>`;
    const clubs = await ctx.client.from('clubs').select('id,official_name,crest_path,status').eq('organization_id', ctx.organization.id).order('official_name');
    const candidateTeams = (clubs.data || []).filter((club) => club.status !== 'archived' && !entries.some((entry) => entry.club_id === club.id));
    const search = panelMain().querySelector<HTMLInputElement>('#club-search');
    const searchResults = panelMain().querySelector<HTMLElement>('#club-search-results');
    const renderCandidates = () => {
      if (!searchResults) return;
      const found = filterTeamDirectory(candidateTeams, search?.value || '');
      searchResults.innerHTML = found.length ? found.map((club) => `<button type="button" class="team-select-result" data-club-id="${club.id}"><span>${escapeHtml(club.official_name)}</span><small>Adicionar à temporada</small></button>`).join('') : '<p class="data-note">Nenhuma equipe encontrada. Cadastre uma nova para continuar.</p>';
      searchResults.querySelectorAll<HTMLButtonElement>('.team-select-result').forEach((button) => button.addEventListener('click', async () => {
        const club = candidateTeams.find((item) => item.id === button.dataset.clubId); if (!club) return;
        button.disabled = true;
        const entry = await ctx.client.from('competition_entries').insert({ season_id: selected.id, club_id: club.id, club_name_snapshot: club.official_name, crest_path_snapshot: club.crest_path, status: 'confirmed' });
        if (entry.error) { const message = panelMain().querySelector<HTMLElement>('#entry-search-status'); if (message) message.textContent = entry.error.message; button.disabled = false; } else location.reload();
      }));
    };
    search?.addEventListener('input', renderCandidates); renderCandidates();
    panelMain().querySelector<HTMLFormElement>('#match-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const fields = new FormData(form);
      const home = String(fields.get('home')), away = String(fields.get('away'));
      if (home === away) { form.querySelector<HTMLElement>('[role="status"]')!.textContent = 'Escolha equipes diferentes.'; return; }
      const date = String(fields.get('date') || '');
      const result = await ctx.client.from('matches').insert({ season_id: selected.id, home_entry_id: home, away_entry_id: away, round_number: Number(fields.get('round')), scheduled_at: date ? new Date(date).toISOString() : null, status: 'scheduled' });
      if (result.error) form.querySelector<HTMLElement>('[role="status"]')!.textContent = result.error.message;
      else location.reload();
    });
  }
}

export function publicFixture(match: any, entries: Map<string, any>, crests: Map<string, string>, shootout?: any, detailHref?: string, detail = false) {
  const home = entries.get(match.home_entry_id);
  const away = entries.get(match.away_entry_id);
  const hasResult = ['completed', 'confirmed'].includes(match.status) && match.home_score !== null && match.away_score !== null;
  const winner = match.status === 'confirmed' && hasResult
    ? shootout?.winning_entry_id || (match.home_score > match.away_score ? match.home_entry_id : match.away_score > match.home_score ? match.away_entry_id : null)
    : null;
  const team = (entry: any, fallback: string) => {
    const name = entry?.club_name_snapshot || fallback;
    const crest = entry?.crest_path_snapshot && crests.get(entry.crest_path_snapshot);
    const label = entry?.club_id && safeId(entry.club_id) ? `<a href="/clubes/${entry.club_id}">${escapeHtml(name)}</a>` : `<strong>${escapeHtml(name)}</strong>`;
    return `<div class="fixture-team ${winner === entry?.id ? 'fixture-winner' : ''}"><div class="fixture-crest-frame">${teamShieldMarkup(crest, name, detail ? 'hero' : 'large', detail ? 'eager' : 'lazy')}</div><div class="fixture-team-name">${label}${winner === entry?.id ? '<small>Vencedor</small>' : ''}</div></div>`;
  };
  const score = hasResult ? `${match.home_score} <span aria-hidden="true">×</span> ${match.away_score}` : '<span aria-label="Partida agendada">VS</span>';
  const presentation = hasResult ? winner ? 'decisive' : 'draw' : 'scheduled';
  const labels: Record<string, string> = { confirmed: 'Resultado confirmado', completed: 'Finalizada', in_progress: 'Em andamento', scheduled: 'Agendada', cancelled: 'Cancelada' };
  const phases: Record<string, string> = { league: 'Liga', groups: 'Grupos', round_of_16: 'Oitavas', quarterfinal: 'Quartas', semifinal: 'Semifinal', third_place: 'Terceiro lugar', final: 'Final' };
  const date = match.scheduled_at || !detail ? `<span class="fixture-date">${escapeHtml(readableDate(match.scheduled_at))}</span>` : '';
  const outcome = shootout ? `<span class="fixture-penalties">Pênaltis: ${shootout.home_score} × ${shootout.away_score}</span>` : presentation === 'draw' ? '<span class="fixture-draw">Empate</span>' : presentation === 'decisive' ? '<span class="fixture-outcome">Resultado definido</span>' : '<span class="fixture-scheduled">Partida agendada</span>';
  const footerOutcome = detail ? '' : outcome;
  return `<article class="public-fixture match-arena match-arena--${presentation}${detail ? ' match-detail-arena' : ''}" data-match-id="${escapeHtml(match.id)}" data-fixture-status="${escapeHtml(match.status)}" data-round="${escapeHtml(match.round_number || 0)}"><div class="fixture-meta"><span>${escapeHtml(phases[match.phase] || match.phase)}${match.round_number ? ` · Rodada ${match.round_number}` : ''}</span><span class="fixture-status">${labels[match.status] || escapeHtml(match.status)}</span></div><div class="fixture-main">${team(home, 'Equipe indisponível')}<div class="fixture-score" aria-label="${hasResult ? `Placar ${match.home_score} a ${match.away_score}` : 'Sem placar'}">${score}</div>${team(away, 'Equipe indisponível')}</div>${date || footerOutcome ? `<div class="fixture-bottom">${date}${footerOutcome}</div>` : ''}${detailHref ? `<a class="fixture-detail-link" href="${escapeHtml(detailHref)}">Detalhes da partida <span aria-hidden="true">→</span></a>` : ''}</article>`;
}

function publicStandingTeam(row: any, entries: Map<string, any>, crests: Map<string, string>, leader = false, demo = false) {
  const entry = entries.get(row.id);
  const crest = entry?.crest_path_snapshot && crests.get(entry.crest_path_snapshot);
  const name = !demo && entry?.club_id && safeId(entry.club_id) ? `<a href="/clubes/${entry.club_id}">${escapeHtml(row.name)}</a>` : `<strong>${escapeHtml(row.name)}</strong>`;
  return `<span class="standing-team"><span class="standing-crest">${teamShieldMarkup(crest, row.name, 'small')}</span><span class="standing-team-label">${name}${leader ? '<span class="standing-leader-tag">Líder</span>' : ''}</span></span>`;
}

function publicRecentForm(row: any) {
  const labels: Record<string, string> = { V: 'Vitória', E: 'Empate', D: 'Derrota' };
  return `<span class="recent-form" aria-label="Últimos resultados">${row.recent.slice(-5).map((result: string) => `<span class="form-${result}" title="${labels[result]}" aria-label="${labels[result]}">${result}</span>`).join('') || '<span class="form-empty">—</span>'}</span>`;
}

export function publicStandingsView(standings: any[], entries: Map<string, any>, crests: Map<string, string>, matches: any[], detailHref: (id: string) => string, demo = false) {
  const hasLeader = standings.some((row) => row.played > 0);
  const performance = (row: any) => row.played ? `${Math.round(row.points / (row.played * 3) * 100)}%` : '—';
  const difference = (row: any) => `${row.goalsFor - row.goalsAgainst > 0 ? '+' : ''}${row.goalsFor - row.goalsAgainst}`;
  const recentHistory = (row: any) => matches
    .filter((match) => match.status === 'confirmed' && match.home_score !== null && match.away_score !== null && (match.home_entry_id === row.id || match.away_entry_id === row.id))
    .sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || ''))
    .slice(0, 3)
    .map((match) => {
      const home = match.home_entry_id === row.id;
      const opponent = entries.get(home ? match.away_entry_id : match.home_entry_id)?.club_name_snapshot || 'Equipe indisponível';
      const score = `${home ? match.home_score : match.away_score} × ${home ? match.away_score : match.home_score}`;
      return `<li><a href="${escapeHtml(detailHref(match.id))}"><span>${escapeHtml(opponent)}</span><strong>${score}</strong><small>${escapeHtml(readableDate(match.scheduled_at))}</small></a></li>`;
    }).join('');
  const expanded = (row: any) => `<div class="standing-expanded"><div class="standing-expanded-stats"><span><b>${row.points}</b> PTS</span><span><b>${row.played}</b> J</span><span><b>${row.wins}</b> V</span><span><b>${row.draws}</b> E</span><span><b>${row.losses}</b> D</span><span><b>${row.goalsFor}</b> GP</span><span><b>${row.goalsAgainst}</b> GC</span><span><b>${difference(row)}</b> SG</span><span><b>${performance(row)}</b> Aproveitamento</span></div><div class="standing-expanded-bottom"><div><h3>Últimos resultados</h3>${publicRecentForm(row)}</div><div><h3>Histórico disponível</h3>${recentHistory(row) ? `<ul class="standing-history">${recentHistory(row)}</ul>` : '<p>Nenhuma partida confirmada.</p>'}</div></div></div>`;
  const rows = standings.map((row, index) => {
    const leader = index === 0 && hasLeader;
    const team = publicStandingTeam(row, entries, crests, leader, demo);
    return {
      desktop: `<tr class="${leader ? 'standing-leader' : ''}"><td><span class="standing-position">${index + 1}</span></td><td>${team}<button class="standing-expand" type="button" data-target="standing-detail-${index}" aria-expanded="false" aria-controls="standing-detail-${index}">Estatísticas e histórico ⌄</button></td><td class="standing-points"><strong>${row.points}</strong></td><td>${row.played}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.goalsFor}</td><td>${row.goalsAgainst}</td><td>${difference(row)}</td><td>${performance(row)}</td><td>${publicRecentForm(row)}</td></tr><tr id="standing-detail-${index}" class="standing-desktop-expanded" hidden><td colspan="12">${expanded(row)}</td></tr>`,
      mobile: `<article class="standing-mobile-row ${leader ? 'standing-leader' : ''}"><span class="standing-mobile-position">${index + 1}</span>${team}<strong class="standing-points">${row.points}</strong><span class="standing-played">${row.played}</span><span class="standing-difference">${difference(row)}</span><details class="standing-mobile-details"><summary aria-label="Expandir estatísticas de ${escapeHtml(row.name)}">Estatísticas e histórico <span aria-hidden="true">⌄</span></summary>${expanded(row)}</details></article>`,
    };
  });
  return `<div class="standings-scroll" role="region" aria-label="Classificação completa" tabindex="0"><table><thead><tr><th scope="col">Pos.</th><th scope="col">Equipe</th><th scope="col">PTS</th><th scope="col">J</th><th scope="col">V</th><th scope="col">E</th><th scope="col">D</th><th scope="col">GP</th><th scope="col">GC</th><th scope="col">SG</th><th scope="col">Apr.</th><th scope="col">Últimos 5</th></tr></thead><tbody>${rows.map((row) => row.desktop).join('')}</tbody></table></div><div class="standings-mobile"><div class="standings-mobile-head"><span>#</span><span>Equipe</span><span>P</span><span>J</span><span>SG</span></div>${rows.map((row) => row.mobile).join('')}</div><p class="data-note">Pontuação calculada das partidas confirmadas. Aproveitamento = pontos conquistados ÷ pontos possíveis.</p>`;
}

export function publicMatchDetailData(match: any, shootout: any, events: any[], entries: Map<string, any>, matches: any[]) {
  const phases: Record<string, string> = { league: 'Liga', groups: 'Grupos', round_of_16: 'Oitavas de final', quarterfinal: 'Quartas de final', semifinal: 'Semifinal', third_place: 'Terceiro lugar', final: 'Final' };
  const status: Record<string, string> = { confirmed: 'Resultado confirmado', completed: 'Finalizada', scheduled: 'Agendada', in_progress: 'Em andamento', cancelled: 'Cancelada' };
  const field = (label: string, value: string | number | null | undefined) => value === null || value === undefined || value === '' ? '' : `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const nextPhase: Record<string, [string, string]> = { round_of_16: ['quarterfinal', 'as quartas de final'], quarterfinal: ['semifinal', 'a semifinal'], semifinal: ['final', 'a final'] };
  const winner = match.status === 'confirmed' && match.home_score !== null && match.away_score !== null
    ? shootout?.winning_entry_id || (match.home_score > match.away_score ? match.home_entry_id : match.away_score > match.home_score ? match.away_entry_id : null)
    : null;
  const next = nextPhase[match.phase];
  const advanced = winner && next && matches.some((other) => other.phase === next[0] && (other.home_entry_id === winner || other.away_entry_id === winner));
  const qualification = advanced ? `<p class="detail-qualification">${escapeHtml(entries.get(winner)?.club_name_snapshot || 'Equipe vencedora')} avança para ${escapeHtml(next[1])}.</p>` : '';
  const items = events.filter((event) => ['goal', 'own_goal', 'yellow_card', 'red_card'].includes(event.event_type)).map((event) => {
    const labels: Record<string, string> = { goal: 'Gol', own_goal: 'Gol contra', yellow_card: 'Cartão amarelo', red_card: 'Cartão vermelho' };
    const player = typeof event.payload?.player_name === 'string' ? event.payload.player_name : typeof event.payload?.player === 'string' ? event.payload.player : '';
    const team = entries.get(event.entry_id)?.club_name_snapshot;
    const minute = Number.isInteger(event.minute) && event.minute >= 0 && event.minute <= 180 ? `${event.minute}′` : '';
    return `<li><strong>${labels[event.event_type]}</strong><span>${[player, team, minute].filter(Boolean).map(escapeHtml).join(' · ')}</span></li>`;
  }).join('');
  const facts = [field('Fase', phases[match.phase] || match.phase), field('Rodada', match.round_number), field('Data e horário', match.scheduled_at ? readableDate(match.scheduled_at) : null), field('Situação', status[match.status] || match.status), shootout ? field('Pênaltis', `${shootout.home_score} × ${shootout.away_score}`) : ''].join('');
  return `<section class="panel-card public-detail-data"><h2>Informações da partida</h2><dl>${facts}</dl>${qualification}${items ? `<div class="detail-events"><h3>Lances registrados</h3><ul>${items}</ul></div>` : ''}</section>`;
}

export async function publicPage(client: SupabaseClient, id: string, demo = false) {
  const target = mount()!;
  if (!safeId(id)) { target.textContent = 'Endereço de campeonato inválido.'; return; }
  const query = await client.from('competitions').select('id,name,sport,status,visibility').eq('id', id).eq('visibility', 'public').maybeSingle();
  fail(query.error);
  const competition = query.data;
  if (!competition) { target.innerHTML = '<div class="public-shell"><a href="/campeonatos">← Campeonatos</a><h1>Campeonato não encontrado</h1><p>Ele pode não estar publicado.</p></div>'; return; }
  document.title = `${competition.name} | TR Campeonatos`;
  const seasonsQuery = await client.from('competition_seasons').select('id,label,format,status').eq('competition_id', id).order('created_at', { ascending: false });
  fail(seasonsQuery.error);
  const seasons = seasonsQuery.data || [];
  const requested = new URLSearchParams(location.search).get('temporada');
  const season = seasons.find((item) => item.id === requested) || seasons[0];
  let entries: any[] = [], matches: any[] = [], titles: any[] = [], shootouts: any[] = [];
  if (season) {
    const results = await Promise.all([
      client.from('competition_entries').select('id,club_id,club_name_snapshot,crest_path_snapshot,status').eq('season_id', season.id),
      client.from('matches').select('id,phase,round_number,scheduled_at,home_entry_id,away_entry_id,home_score,away_score,status,updated_at').eq('season_id', season.id).order('scheduled_at', { ascending: true, nullsFirst: false }),
      client.from('competition_titles').select('id,place,club_id').eq('season_id', season.id),
    ]);
    results.forEach((result) => fail(result.error));
    entries = results[0].data || []; matches = results[1].data || []; titles = results[2].data || [];
    if (matches.length) {
      const penalties = await client.from('penalty_shootouts').select('match_id,home_score,away_score,winning_entry_id').in('match_id', matches.map((match) => match.id));
      fail(penalties.error); shootouts = penalties.data || [];
    }
  }
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const crestUrls = new Map<string, string>();
  await Promise.all([...new Set(entries.map((entry) => entry.crest_path_snapshot).filter(Boolean))].map(async (path) => {
    const result = await client.storage.from('club-crests').createSignedUrl(path, 3600);
    if (!result.error) crestUrls.set(path, result.data.signedUrl);
  }));
  const shootoutByMatch = new Map(shootouts.map((item) => [item.match_id, item]));
  const names = new Map(entries.map((entry) => [entry.id, entry.club_name_snapshot]));
  const standings = entries.filter((entry) => entry.status === 'confirmed').map((entry) => ({ id: entry.id, name: entry.club_name_snapshot, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, recent: [] as string[] }));
  const byId = new Map(standings.map((row) => [row.id, row]));
  for (const match of matches.filter((item) => item.status === 'confirmed' && ['league', 'groups'].includes(item.phase) && item.home_score !== null && item.away_score !== null)) {
    const home = byId.get(match.home_entry_id), away = byId.get(match.away_entry_id);
    if (!home || !away) continue;
    home.played++; away.played++; home.goalsFor += match.home_score; home.goalsAgainst += match.away_score; away.goalsFor += match.away_score; away.goalsAgainst += match.home_score;
    if (match.home_score > match.away_score) { home.wins++; away.losses++; home.points += 3; home.recent.push('V'); away.recent.push('D'); }
    else if (match.home_score < match.away_score) { away.wins++; home.losses++; away.points += 3; home.recent.push('D'); away.recent.push('V'); }
    else { home.draws++; away.draws++; home.points++; away.points++; home.recent.push('E'); away.recent.push('E'); }
  }
  const standingsSupported = demo || ['Futebol', 'Futsal'].includes(competition.sport);
  standings.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name));
  const titleNames = new Map(entries.map((entry) => [entry.club_id, entry.club_name_snapshot]));
  target.removeAttribute('role');
  const publicStatus = (value: string) => ({ active: 'Em andamento', draft: 'Rascunho', finished: 'Encerrado', completed: 'Concluído', published: 'Publicado', cancelled: 'Cancelado' } as Record<string, string>)[value] || value;
  const publicFormat = (value: string) => ({ round_robin: 'Pontos corridos', knockout: 'Mata-mata', groups_knockout: 'Grupos e mata-mata' } as Record<string, string>)[value] || value;
  const routeBase = demo ? location.pathname : `/c/${id}`;
  const publicBase = `${routeBase}${season ? `?temporada=${encodeURIComponent(season.id)}` : ''}`;
  const detailHref = (matchId: string) => `${routeBase}?temporada=${encodeURIComponent(season.id)}&jogo=${encodeURIComponent(matchId)}`;
  const header = `<header class="public-header"><a class="public-brand" href="/" aria-label="TR Campeonatos, início"><img src="/assets/official/01_logo_principal_transparente.png" alt="TR Campeonatos"></a><nav aria-label="Navegação geral"><a href="/campeonatos">Campeonatos</a><a href="/demonstracao">Demonstração</a></nav></header>`;
  const navBase = new URLSearchParams(location.search).has("jogo") ? publicBase : "";
  const mobileNav = `<nav class="public-mobile-nav" aria-label="Seções da competição"><a href="${navBase}#inicio"><span aria-hidden="true">⌂</span>Início</a><a href="${navBase}#classificacao"><span aria-hidden="true">♜</span>Classificação</a><a href="${navBase}#jogos"><span aria-hidden="true">▣</span>Jogos</a><a href="${navBase}#equipes"><span aria-hidden="true">♟</span>Equipes</a><a href="${navBase}#estatisticas"><span aria-hidden="true">▥</span>Estatísticas</a></nav>`;
  const requestedMatch = new URLSearchParams(location.search).get('jogo');
  const selectedMatch = requestedMatch && matches.find((match) => match.id === requestedMatch);
  if (requestedMatch) {
    const shootout = selectedMatch ? shootoutByMatch.get(selectedMatch.id) : null;
    const eventsQuery = selectedMatch?.status === 'confirmed'
      ? await client.from('match_events').select('id,entry_id,event_type,minute,payload').eq('match_id', selectedMatch.id).order('minute', { ascending: true })
      : null;
    if (eventsQuery) fail(eventsQuery.error);
    const detail = selectedMatch ? `<div class="public-hero public-detail-hero"><span>DETALHES DA PARTIDA · ${escapeHtml(competition.name)}</span><h1>${escapeHtml((entryById.get(selectedMatch.home_entry_id)?.club_name_snapshot || 'Mandante') + ' × ' + (entryById.get(selectedMatch.away_entry_id)?.club_name_snapshot || 'Visitante'))}</h1>${selectedMatch.scheduled_at ? `<p>${escapeHtml(readableDate(selectedMatch.scheduled_at))}</p>` : ''}</div>${publicFixture(selectedMatch, entryById, crestUrls, shootout, undefined, true)}${publicMatchDetailData(selectedMatch, shootout, eventsQuery?.data || [], entryById, matches)}` : `<section class="panel-card"><h1>Partida não encontrada</h1><p>Este confronto pode não estar disponível publicamente.</p></section>`;
    target.innerHTML = `${header}<main class="public-shell public-detail-page"><a class="back-link" href="${escapeHtml(publicBase)}#jogos">← Voltar aos jogos</a>${detail}</main>${mobileNav}`;
  } else {
    const confirmed = matches.filter((match) => match.status === 'confirmed' && match.home_score !== null && match.away_score !== null);
    const upcoming = matches.filter((match) => ['scheduled', 'in_progress'].includes(match.status));
    const featured = confirmed.at(-1) || matches.find((match) => match.status === 'completed') || upcoming[0];
    const rounds = [...new Set(matches.map((match) => match.round_number).filter(Boolean))].sort((a, b) => a - b);
    const resultCount = confirmed.length;
    const goals = confirmed.reduce((sum, match) => sum + match.home_score + match.away_score, 0);
    const teamCards = entries.filter((entry) => entry.status === 'confirmed').map((entry) => {
      const crest = entry.crest_path_snapshot && crestUrls.get(entry.crest_path_snapshot);
      const name = escapeHtml(entry.club_name_snapshot);
      const content = `${teamShieldMarkup(crest, entry.club_name_snapshot, 'medium')}<strong>${name}</strong>`;
      return !demo && entry.club_id && safeId(entry.club_id) ? `<a class="public-team-card" href="/clubes/${entry.club_id}">${content}<span>Ver perfil →</span></a>` : `<div class="public-team-card">${content}</div>`;
    }).join('');
    const standingsTable = standingsSupported && (season?.format === "round_robin" || season?.format === "groups_knockout") && standings.length ? publicStandingsView(standings, entryById, crestUrls, matches, detailHref, demo) : "<p>A classificação por pontos ainda não está disponível para esta modalidade ou formato, ou não há equipes confirmadas.</p>";
    target.innerHTML = `${header}<main class="public-shell"><div id="inicio" class="public-hero"><span>${demo ? 'DEMONSTRAÇÃO · DADOS FICTÍCIOS' : 'VITRINE PÚBLICA'} · ${escapeHtml(season?.label || competition.sport)}</span><h1>${escapeHtml(competition.name)}</h1><p>${escapeHtml(competition.sport)} · ${escapeHtml(publicStatus(competition.status))} · ${entries.length} equipes</p><div class="public-share-actions"><button id="share-competition" class="secondary-action" type="button">Compartilhar campeonato</button><a class="secondary-action" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(competition.name + ' — ' + location.origin + routeBase)}">Enviar no WhatsApp</a></div><p id="share-status" role="status"></p></div><nav class="public-section-nav" aria-label="Seções da competição"><a href="#inicio">Início</a><a href="#classificacao">Classificação</a><a href="#jogos">Jogos</a><a href="#equipes">Equipes</a><a href="#estatisticas">Estatísticas</a></nav>${season ? `<div class="season-bar"><label>Temporada<select id="public-season">${seasons.map((item) => `<option value="${item.id}" ${item.id === season.id ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label><span>${escapeHtml(publicFormat(season.format))} · ${escapeHtml(publicStatus(season.status))}</span></div><div class="public-overview"><section class="panel-card public-featured" aria-label="Jogo em destaque"><div class="public-section-heading"><div><span>EM DESTAQUE</span><h2>${featured?.status === 'confirmed' ? 'Último resultado' : 'Próximo confronto'}</h2></div><a href="#jogos">Todos os jogos →</a></div>${featured ? publicFixture(featured, entryById, crestUrls, shootoutByMatch.get(featured.id), detailHref(featured.id)) : '<p>Nenhuma partida cadastrada nesta temporada.</p>'}</section><section class="panel-card public-upcoming"><div class="public-section-heading"><div><span>AGENDA</span><h2>Próximos jogos</h2></div></div>${upcoming.length ? upcoming.slice(0, 1).map((match) => publicFixture(match, entryById, crestUrls, shootoutByMatch.get(match.id), detailHref(match.id))).join('') + `<a class="upcoming-all" href="#jogos">Ver todos os confrontos →</a>` : '<p>Nenhum próximo jogo cadastrado.</p>'}</section></div><section class="panel-card public-section" id="jogos"><div class="public-section-heading"><div><span>CENTRAL DE PARTIDAS</span><h2>Jogos e resultados</h2></div><span>${matches.length} confrontos</span></div><div class="fixture-controls"><div role="group" aria-label="Filtrar partidas"><button type="button" class="fixture-filter active" data-filter="all" aria-pressed="true">Todas</button><button type="button" class="fixture-filter" data-filter="results" aria-pressed="false">Resultados</button><button type="button" class="fixture-filter" data-filter="upcoming" aria-pressed="false">Próximas</button></div><label>Rodada<select id="round-filter"><option value="all">Todas</option>${rounds.map((round) => `<option value="${round}">Rodada ${round}</option>`).join('')}</select></label></div><div class="public-fixtures">${matches.length ? matches.map((match) => publicFixture(match, entryById, crestUrls, shootoutByMatch.get(match.id), detailHref(match.id))).join('') : '<p>Nenhuma partida publicada nesta temporada.</p>'}</div><p id="fixture-empty" class="data-note" hidden>Nenhuma partida corresponde aos filtros.</p></section><section class="panel-card public-section" id="classificacao"><div class="public-section-heading"><div><span>TABELA DO CAMPEONATO</span><h2>Classificação</h2></div><span>${standings.length} equipes</span></div>${standingsTable}</section><section class="panel-card public-section" id="equipes"><div class="public-section-heading"><div><span>PARTICIPANTES</span><h2>Equipes</h2></div></div><div class="public-team-grid">${teamCards || '<p>Nenhuma equipe confirmada nesta temporada.</p>'}</div></section><section class="panel-card public-section" id="estatisticas"><div class="public-section-heading"><div><span>DADOS DA TEMPORADA</span><h2>Estatísticas</h2></div></div><div class="public-stats-grid"><div><strong>${resultCount}</strong><span>Resultados confirmados</span></div><div><strong>${upcoming.length}</strong><span>Jogos por disputar</span></div>${standingsSupported ? `<div><strong>${goals}</strong><span>Gols confirmados</span></div>` : ''}</div><p class="data-note">${demo ? 'Os números são calculados dos placares desta demonstração. Estatísticas de atletas aparecem somente quando são cadastradas.' : 'Os números são calculados dos registros oficiais. Estatísticas de atletas aparecem somente após cadastro da súmula.'}</p></section><section class="panel-card public-section"><div class="public-section-heading"><div><span>HISTÓRIA DA COMPETIÇÃO</span><h2>Conquistas confirmadas</h2></div></div>${titles.length ? titles.sort((a, b) => a.place - b.place).map((title) => `<p>${title.place}º lugar · ${escapeHtml(titleNames.get(title.club_id) || 'Clube registrado')}</p>`).join('') : (demo ? '<p>Nenhum título registrado nesta demonstração.</p>' : '<p>Nenhum título oficial confirmado para esta temporada.</p>')}</section>` : '<section class="panel-card"><h2>Nenhuma temporada publicada</h2><p>O organizador ainda não cadastrou uma temporada.</p></section>'}${demo ? '<a class="back-link" href="/demonstracao">← Voltar à demonstração interativa</a>' : '<a class="back-link" href="/campeonatos">← Ver outros campeonatos</a>'}</main>${season ? mobileNav : ''}`;
    const groupedEntries = new Map<string, any[]>();
    for (const entry of entries.filter((item) => item.status === 'confirmed' && typeof item.group_label === 'string' && item.group_label.trim())) {
      const label = entry.group_label.trim();
      groupedEntries.set(label, [...(groupedEntries.get(label) || []), entry]);
    }
    if (groupedEntries.size) {
      const groupCards = [...groupedEntries].map(([label, groupEntries]) => `<article class="public-group-card"><span>GRUPO ${escapeHtml(label)}</span><strong>${groupEntries.length} equipes</strong><ul>${groupEntries.map((entry) => {
        const crest = entry.crest_path_snapshot && crestUrls.get(entry.crest_path_snapshot);
        return `<li>${teamShieldMarkup(crest, entry.club_name_snapshot, 'small')}<span>${escapeHtml(entry.club_name_snapshot)}</span></li>`;
      }).join('')}</ul></article>`).join('');
      target.querySelector('#jogos')?.insertAdjacentHTML('beforebegin', `<section class="panel-card public-section" id="grupos"><div class="public-section-heading"><div><span>PRIMEIRA FASE</span><h2>Grupos</h2></div><span>${groupedEntries.size} grupos</span></div><div class="public-groups-grid">${groupCards}</div></section>`);
      const groupStandings = [...groupedEntries].map(([label, groupEntries]) => {
        const ids = new Set(groupEntries.map((entry) => entry.id));
        const rows = standings.filter((row) => ids.has(row.id));
        return `<div class="public-group-standings"><h3>Grupo ${escapeHtml(label)}</h3>${publicStandingsView(rows, entryById, crestUrls, matches.filter((match) => match.phase === 'groups' && ids.has(match.home_entry_id) && ids.has(match.away_entry_id)), detailHref, demo)}</div>`;
      }).join('');
      const classification = target.querySelector('#classificacao');
      if (classification) classification.innerHTML = `<div class="public-section-heading"><div><span>TABELAS DA PRIMEIRA FASE</span><h2>Classificação dos grupos</h2></div></div><div class="public-group-tables">${groupStandings}</div>`;
      target.querySelector('.public-section-nav a[href="#classificacao"]')?.insertAdjacentHTML('beforebegin', '<a href="#grupos">Grupos</a>');
    } else if (season?.format === 'groups_knockout') {
      const classification = target.querySelector('#classificacao');
      if (classification) classification.innerHTML = '<div class="public-section-heading"><div><span>PRIMEIRA FASE</span><h2>Classificação dos grupos</h2></div></div><p>A distribuição oficial dos grupos ainda não está disponível nesta temporada.</p>';
    }
    const knockoutPhases = [
      ['round_of_16', 'Oitavas de final'], ['quarterfinal', 'Quartas de final'],
      ['semifinal', 'Semifinais'], ['third_place', 'Terceiro lugar'], ['final', 'Final'],
    ] as const;
    const bracket = knockoutPhases.map(([phase, label]) => {
      const phaseMatches = matches.filter((match) => match.phase === phase);
      return phaseMatches.length ? `<div class="public-knockout-phase"><h3>${label}</h3>${phaseMatches.map((match) => publicFixture(match, entryById, crestUrls, shootoutByMatch.get(match.id), detailHref(match.id))).join('')}</div>` : '';
    }).filter(Boolean).join('');
    if (bracket) {
      target.querySelector('#equipes')?.insertAdjacentHTML('beforebegin', `<section class="panel-card public-section" id="mata-mata"><div class="public-section-heading"><div><span>CAMINHO DO TÍTULO</span><h2>Mata-mata</h2></div></div><div class="public-knockout-grid">${bracket}</div></section>`);
      target.querySelector('.public-section-nav a[href="#equipes"]')?.insertAdjacentHTML('beforebegin', '<a href="#mata-mata">Mata-mata</a>');
    }
    let activeFilter = 'all';
    const updateFixtures = () => {
      const round = target.querySelector<HTMLSelectElement>('#round-filter')?.value || 'all';
      let visible = 0;
      target.querySelectorAll<HTMLElement>('.public-fixtures .public-fixture').forEach((card) => {
        const result = ['confirmed', 'completed'].includes(card.dataset.fixtureStatus || '');
        const keep = (activeFilter === 'all' || (activeFilter === 'results' ? result : !result)) && (round === 'all' || card.dataset.round === round);
        card.hidden = !keep;
        if (keep) visible++;
      });
      const emptyMessage = target.querySelector<HTMLElement>('#fixture-empty');
      if (emptyMessage) emptyMessage.hidden = visible > 0;
    };
    target.querySelectorAll<HTMLButtonElement>('.fixture-filter').forEach((button) => button.addEventListener('click', () => {
      activeFilter = button.dataset.filter || 'all';
      target.querySelectorAll<HTMLButtonElement>('.fixture-filter').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
      updateFixtures();
    }));
    target.querySelector<HTMLSelectElement>('#round-filter')?.addEventListener('change', updateFixtures);
    const markNav = () => { const current = location.hash || "#inicio"; target.querySelectorAll<HTMLAnchorElement>(".public-mobile-nav a").forEach((link) => { if (link.hash === current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current"); }); };
    window.addEventListener("hashchange", markNav); markNav();
  }
  if (requestedMatch) target.querySelector('.public-mobile-nav a[href$="#jogos"]')?.setAttribute('aria-current', 'page');
  target.querySelectorAll<HTMLButtonElement>('.standing-expand').forEach((button) => button.addEventListener('click', () => {
    const detail = target.querySelector<HTMLElement>(`#${button.dataset.target}`);
    if (!detail) return;
    detail.hidden = !detail.hidden;
    button.setAttribute('aria-expanded', String(!detail.hidden));
  }));
  const animatedMatch = sessionStorage.getItem('tr-public-updated-match');
  if (animatedMatch && safeId(animatedMatch)) target.querySelector(`[data-match-id="${animatedMatch}"]`)?.classList.add('fixture-updated');
  sessionStorage.removeItem('tr-public-updated-match');
  target.querySelector<HTMLSelectElement>('#public-season')?.addEventListener('change', (event) => { location.assign(`?temporada=${(event.target as HTMLSelectElement).value}`); });
  target.querySelector('#share-competition')?.addEventListener('click', async () => {
    const url = location.href;
    const status = target.querySelector<HTMLElement>('#share-status')!;
    try {
      if (navigator.share) await navigator.share({ title: competition.name, url });
      else { await navigator.clipboard.writeText(url); status.textContent = 'Link copiado.'; }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      status.textContent = 'Selecione e copie o link: ';
      const input = document.createElement('input');
      input.type = 'text'; input.readOnly = true; input.value = url;
      input.setAttribute('aria-label', 'Link público do campeonato');
      status.append(input); input.focus(); input.select();
    }
  });
  if (season && !demo) {
    const snapshot = matches.map((match) => `${match.id}:${match.updated_at}`).sort().join('|');
    const initialVersions = new Map(matches.map((match) => [match.id, match.updated_at]));
    const refreshIfChanged = async () => {
      if (document.visibilityState === 'hidden') return;
      const [published, recent] = await Promise.all([
        client.from('competitions').select('visibility').eq('id', id).maybeSingle(),
        client.from('matches').select('id,updated_at').eq('season_id', season.id),
      ]);
      if (published.error || recent.error) return;
      const changed = (recent.data || []).find((match) => initialVersions.get(match.id) !== match.updated_at);
      if (changed?.id) sessionStorage.setItem('tr-public-updated-match', changed.id);
      if (!published.data || (recent.data || []).map((match) => `${match.id}:${match.updated_at}`).sort().join('|') !== snapshot) location.reload();
    };
    const channel = client.channel(`public-season-${season.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `season_id=eq.${season.id}` }, (payload) => { if (payload.new && 'id' in payload.new) sessionStorage.setItem('tr-public-updated-match', String(payload.new.id)); location.reload(); }).subscribe();
    const timer = window.setInterval(refreshIfChanged, 30000);
    document.addEventListener('visibilitychange', refreshIfChanged);
    window.addEventListener('pagehide', () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshIfChanged); void client.removeChannel(channel); }, { once: true });
  }
}

async function publicClub(client: SupabaseClient, id: string) {
  const target = mount()!;
  if (!safeId(id)) { target.textContent = 'Endereço de clube inválido.'; return; }
  const clubQuery = await client.from('clubs').select('id,official_name,short_name,sport,crest_path,status').eq('id', id).maybeSingle();
  fail(clubQuery.error);
  const club = clubQuery.data;
  if (!club) { target.innerHTML = '<main class="public-shell"><a href="/campeonatos">← Campeonatos</a><h1>Clube não encontrado</h1><p>Este perfil pode não estar público.</p></main>'; return; }
  const [entryQuery, titleQuery] = await Promise.all([
    client.from('competition_entries').select('id,season_id,final_position,final_phase,season:competition_seasons(id,label,competition:competitions(id,name,sport,visibility))').eq('club_id', id).order('registered_at', { ascending: false }),
    client.from('competition_titles').select('id,place,confirmed_at,season:competition_seasons(id,label,competition:competitions(id,name,sport,visibility))').eq('club_id', id).order('confirmed_at', { ascending: false }),
  ]);
  fail(entryQuery.error); fail(titleQuery.error);
  const entries = (entryQuery.data || []).filter((entry: any) => entry.season?.competition?.visibility === 'public');
  const titles = (titleQuery.data || []).filter((item: any) => item.season?.competition?.visibility === 'public');
  const seasonIds = [...new Set(entries.map((entry: any) => entry.season_id))];
  let playedMatches: any[] = [], participants: any[] = [];
  if (seasonIds.length) {
    const [matchResult, participantResult] = await Promise.all([
      client.from('matches').select('id,season_id,scheduled_at,home_entry_id,away_entry_id,home_score,away_score').in('season_id', seasonIds).eq('status', 'confirmed').order('scheduled_at', { ascending: false, nullsFirst: false }),
      client.from('competition_entries').select('id,club_name_snapshot').in('season_id', seasonIds),
    ]);
    fail(matchResult.error); fail(participantResult.error);
    const ownEntries = new Set(entries.map((entry: any) => entry.id));
    playedMatches = (matchResult.data || []).filter((match) => ownEntries.has(match.home_entry_id) || ownEntries.has(match.away_entry_id));
    participants = participantResult.data || [];
  }
  const ownEntries = new Set(entries.map((entry: any) => entry.id));
  const participantNames = new Map(participants.map((entry) => [entry.id, entry.club_name_snapshot]));
  const lifetime = { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 };
  for (const match of playedMatches) {
    const home = ownEntries.has(match.home_entry_id);
    const scored = home ? match.home_score : match.away_score;
    const conceded = home ? match.away_score : match.home_score;
    lifetime.played++; lifetime.scored += scored; lifetime.conceded += conceded;
    if (scored > conceded) lifetime.wins++;
    else if (scored < conceded) lifetime.losses++;
    else lifetime.draws++;
  }
  const recentMatches = playedMatches.slice(0, 5).map((match) => {
    const home = ownEntries.has(match.home_entry_id);
    const opponent = participantNames.get(home ? match.away_entry_id : match.home_entry_id) || 'Adversário';
    return `<div class="history-row"><strong>${escapeHtml(opponent)}</strong><span>${home ? `${match.home_score} × ${match.away_score}` : `${match.away_score} × ${match.home_score}`} · ${escapeHtml(readableDate(match.scheduled_at))}</span></div>`;
  }).join('');
  const historyMetrics = [
    ['Partidas', lifetime.played], ['Vitórias', lifetime.wins], ['Empates', lifetime.draws],
    ['Derrotas', lifetime.losses], ['Marcados', lifetime.scored], ['Sofridos', lifetime.conceded],
  ];
  const historySummary = `<div class="public-history-metrics">${historyMetrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`;
  let crestUrl: string | null = null;
  if (club.crest_path) {
    const signed = await client.storage.from('club-crests').createSignedUrl(club.crest_path, 3600);
    if (!signed.error) crestUrl = signed.data.signedUrl;
  }
  document.title = `${club.official_name} | TR Campeonatos`;
  target.removeAttribute('role');
  target.innerHTML = `<header class="public-header"><a href="/"><img src="/assets/official/01_logo_principal_transparente.png" alt="TR Campeonatos"></a><nav><a href="/campeonatos">Campeonatos</a><a href="/demonstracao">Demonstração</a></nav></header><main class="public-shell"><div class="public-hero club-hero">${crestUrl ? `<span class="club-crest">${teamShieldMarkup(crestUrl, club.official_name, 'hero', 'eager')}</span>` : ''}<div><span>PERFIL OFICIAL DO CLUBE</span><h1>${escapeHtml(club.official_name)}</h1><p>${escapeHtml(club.sport)} · Identidade permanente</p></div></div>${historySummary}<div class="public-grid"><section class="panel-card"><h2>Participações públicas</h2>${entries.length ? entries.map((entry: any) => `<article class="history-row"><strong><a href="/c/${entry.season.competition.id}">${escapeHtml(entry.season.competition.name)}</a></strong><span>${escapeHtml(entry.season.label)} · ${entry.final_position ? `${entry.final_position}º lugar` : entry.final_phase ? escapeHtml(entry.final_phase) : 'Participação registrada'}</span></article>`).join('') : '<p>Nenhuma participação pública registrada.</p>'}</section><section class="panel-card"><h2>Conquistas confirmadas</h2>${titles.length ? titles.map((title: any) => `<article class="history-row"><strong>${title.place === 1 ? 'Campeão' : title.place === 2 ? 'Vice-campeão' : 'Terceiro lugar'}</strong><span>${escapeHtml(title.season.competition.name)} · ${escapeHtml(title.season.label)}</span></article>`).join('') : '<p>Nenhum título oficial confirmado.</p>'}</section></div><section class="panel-card"><h2>Resultados recentes</h2>${recentMatches || '<p>Nenhuma partida confirmada em competições públicas.</p>'}</section><a class="back-link" href="/campeonatos">← Ver campeonatos</a></main>`;
}

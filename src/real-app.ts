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
const missingSchemaFeature = (error: { code?: string; message?: string } | null) => Boolean(error && (['42703', 'PGRST202', 'PGRST204'].includes(error.code || '') || /column .* does not exist|could not find .* column|could not find the function/i.test(error.message || '')));
const editor = (role: string) => ['owner', 'admin', 'editor'].includes(role);
export const DEFAULT_TEAM_SHIELD = '/assets/official/06_escudo_padrao_tr_campeonatos.webp';
export const DEFAULT_COMPETITION_SHIELD = DEFAULT_TEAM_SHIELD;
const PUBLIC_BRAND = '<picture><source srcset="/assets/official/01_logo_principal_transparente-320.avif" type="image/avif"><img src="/assets/official/01_logo_principal_transparente-320.webp" alt="TR Campeonatos" width="320" height="190" decoding="async"></picture>';
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
  const processedPath = prepared.processed ? `${clubId}/processed/${jobId}.${prepared.processed.type === 'image/webp' ? 'webp' : 'png'}` : null;
  const originalUpload = await client.storage.from('club-crests').upload(originalPath, file, { upsert: false, contentType: prepared.source.mime });
  if (originalUpload.error) throw new Error(`Não foi possível guardar o original: ${originalUpload.error.message}`);
  if (prepared.processed && processedPath) {
    const outputUpload = await client.storage.from('club-crests').upload(processedPath, prepared.processed, { upsert: false, contentType: prepared.processed.type });
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
    notice: prepared.status === 'processed' ? 'Escudo otimizado em 512 px. Fundo preservado quando a remoção não era segura.' : prepared.meta.mode === 'original_selected' ? 'Imagem original escolhida e preservada.' : 'Imagem original preservada.',
  };
}

async function storeCompetitionShield(ctx: Context, competitionId: string, file: File, prepared: SmartShieldResult) {
  if (!safeId(competitionId)) throw new Error('Campeonato inválido.');
  const token = crypto.randomUUID();
  const extension = prepared.source.mime === 'image/jpeg' ? 'jpg' : prepared.source.mime === 'image/webp' ? 'webp' : 'png';
  const prefix = `${ctx.organization.id}/${competitionId}`;
  const originalPath = `${prefix}/original/${token}.${extension}`;
  const processedPath = prepared.processed ? `${prefix}/processed/${token}.${prepared.processed.type === 'image/webp' ? 'webp' : 'png'}` : null;
  const bucket = ctx.client.storage.from('competition-crests');
  const original = await bucket.upload(originalPath, file, { upsert: false, contentType: prepared.source.mime });
  if (original.error) throw new Error(`Não foi possível guardar o original: ${original.error.message}`);
  if (prepared.processed && processedPath) {
    const output = await bucket.upload(processedPath, prepared.processed, { upsert: false, contentType: prepared.processed.type });
    if (output.error) throw new Error(`Original guardado, mas a versão otimizada não foi salva: ${output.error.message}`);
  }
  const updated = await ctx.client.from('competitions').update({
    crest_path: processedPath || originalPath, crest_original_path: originalPath,
    crest_processed_path: processedPath, crest_processing_meta: prepared.meta,
  }).eq('id', competitionId).eq('organization_id', ctx.organization.id);
  fail(updated.error);
}

async function signedCompetitionShield(client: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const result = await client.storage.from('competition-crests').createSignedUrl(path, 3600);
  return result.error ? null : result.data.signedUrl;
}

function competitionShieldMarkup(url: string | null | undefined, name: string, className = '') {
  return `<img class="competition-shield ${className}" src="${escapeHtml(url || DEFAULT_COMPETITION_SHIELD)}" alt="Escudo de ${escapeHtml(name)}" loading="lazy" data-competition-shield>`;
}

export function teamShieldMarkup(url: string | null | undefined, teamName: string, variant = 'medium', loading = 'lazy') {
  const label = escapeHtml(teamName);
  return `<span class="team-shield team-shield--${variant}"><img src="${escapeHtml(url || DEFAULT_TEAM_SHIELD)}" alt="Escudo de ${label}" loading="${loading}" decoding="async" width="1254" height="1254" data-team-shield></span>`;
}

// A failed signed URL must not leave an empty crest in fixtures or history.
if (typeof document !== 'undefined') document.addEventListener('error', (event) => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.hasAttribute('data-team-shield') && !image.dataset.fallbackApplied) {
    image.dataset.fallbackApplied = 'true';
    image.src = DEFAULT_TEAM_SHIELD;
  }
  if (image instanceof HTMLImageElement && image.hasAttribute('data-competition-shield') && !image.dataset.fallbackApplied) {
    image.dataset.fallbackApplied = 'true';
    image.src = DEFAULT_COMPETITION_SHIELD;
  }
}, true);

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
  target.innerHTML = `<div class="panel-layout"><aside class="panel-side"><a href="/" class="panel-logo"><img src="/assets/official/01_logo_principal_transparente.webp" alt="TR Campeonatos"></a><div class="panel-org">${escapeHtml(selected.name)}<small>${escapeHtml(selected.role)}</small></div><nav aria-label="Painel do organizador"><a href="/painel" ${location.pathname === '/painel' ? 'aria-current="page"' : ''}>Visão geral</a><a href="/painel/campeonatos" ${location.pathname.startsWith('/painel/campeonatos') ? 'aria-current="page"' : ''}>Campeonatos</a><a href="/painel/equipes" ${location.pathname.startsWith('/painel/equipes') ? 'aria-current="page"' : ''}>Equipes</a><a href="/minha-conta">Minha conta</a><a href="/campeonatos" target="_blank" rel="noopener noreferrer">Vitrine pública</a><a href="/demonstracao/copa-tr-esports" target="_blank" rel="noopener noreferrer">Demonstração esportiva</a></nav><button id="sign-out" type="button">Sair</button></aside><div class="panel-content"><header class="panel-header"><span>Painel do Organizador</span><div><span>${escapeHtml(preferredAccountName(profile, user))}</span>${available.length > 1 ? `<label>Organização<select id="organization-select">${available.map((item) => `<option value="${item.id}" ${item.id === selected.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}</div></header><main id="panel-main" aria-live="polite">Carregando dados oficiais…</main></div></div>`;
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
  target.innerHTML = `<div class="setup-shell"><a href="/"><img src="/assets/official/01_logo_principal_transparente.webp" alt="TR Campeonatos"></a><div class="panel-card"><span class="eyebrow">ACESSO RESTRITO</span><h1>Acesso de organizador necessário</h1><p>${message}</p><div class="restricted-actions"><a class="secondary-action" href="/demonstracao">Abrir demonstração</a><button id="restricted-sign-out" class="primary-action" type="button">Sair da conta</button></div></div></div>`;
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
  target.innerHTML = `<div class="setup-shell"><a href="/"><img src="/assets/official/01_logo_principal_transparente.webp" alt="TR Campeonatos"></a><div class="panel-card"><span class="eyebrow">PRIMEIRO ACESSO</span><h1>Crie sua organização</h1><p>Campeonatos oficiais ficam vinculados à sua organização. Você será o proprietário.</p><form id="organization-form"><label>Nome da organização<input name="name" minlength="2" maxlength="100" required></label><button class="primary-action">Criar organização</button></form><p id="setup-message" role="status"></p></div></div>`;
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

// Names and results remain season snapshots; the visual crest follows the
// permanent club so an identity update appears in past and current seasons.
export async function refreshEntryCrests(client: SupabaseClient, entries: any[]) {
  const ids = [...new Set(entries.map((entry) => entry.club_id).filter((id) => typeof id === 'string' && safeId(id)))];
  if (!ids.length) return;
  let result: any = await client.from('clubs').select('id,crest_path,public_background_id').in('id', ids);
  if (missingSchemaFeature(result.error)) result = await client.from('clubs').select('id,crest_path').in('id', ids);
  if (result.error) return;
  const current = new Map<string, any>((result.data || []).map((club: any) => [club.id, club]));
  entries.forEach((entry) => {
    if (current.has(entry.club_id)) {
      const club = current.get(entry.club_id);
      entry.crest_path_snapshot = club?.crest_path;
      if (club && Object.hasOwn(club, 'public_background_id')) entry.public_background_id = club.public_background_id;
    }
  });
}

const TEAM_BACKGROUND_FILES = ['01_classico_azul', '02_dourado', '03_eletrico_azul', '04_fogo_vermelho', '05_natureza_verde', '06_roxo', '07_preto_e_branco', '08_neon_roxo_azul', '09_urbano_noturno', '10_laranja', '11_gelo', '12_arena_vip_dourado', '13_tempestade', '14_vermelho_e_preto', '15_verde_e_preto', '16_galaxia', '17_por_do_sol', '18_prata', '19_graffiti', '20_futurista'];

function teamBackgroundChoiceMarkup(selected: unknown = null) {
  const id = Number(selected);
  const valid = Number.isInteger(id) && id >= 1 && id <= 20 ? id : 0;
  const names = ['Clássico azul', 'Dourado', 'Elétrico azul', 'Fogo vermelho', 'Natureza verde', 'Roxo', 'Preto e branco', 'Neon roxo e azul', 'Urbano noturno', 'Laranja', 'Gelo', 'Arena VIP dourada', 'Tempestade', 'Vermelho e preto', 'Verde e preto', 'Galáxia', 'Pôr do sol', 'Prata', 'Graffiti', 'Futurista'];
  const options = [`<label class="team-background-option team-background-default"><input type="radio" name="public_background_id" value="0" ${valid === 0 ? 'checked' : ''}><span class="team-background-thumb team-background-thumb-default">PADRÃO</span><strong>Fundo padrão</strong></label>`, ...names.map((name, index) => {
    const backgroundId = index + 1;
    return `<label class="team-background-option"><input type="radio" name="public_background_id" value="${backgroundId}" ${valid === backgroundId ? 'checked' : ''}><img class="team-background-thumb" src="/assets/team-backgrounds/${TEAM_BACKGROUND_FILES[index]}.webp" alt="" loading="lazy"><strong>${name}</strong></label>`;
  })].join('');
  return `<fieldset class="team-background-choice"><legend>Fundo do cartão público</legend><small>Escolha um dos 20 fundos. Ele aparece atrás do escudo e do nome da equipe na vitrine pública.</small><div class="team-background-gallery">${options}</div></fieldset>`;
}

function crestChoiceMarkup(currentUrl: string | null = null, editing = false, kind: 'equipe' | 'campeonato' = 'equipe') {
  const selected = currentUrl && editing ? 'current' : 'default';
  const article = kind === 'equipe' ? 'da' : 'do';
  return `<fieldset class="crest-choice"><legend>Escudo ${article} ${kind}</legend><div class="crest-choice-options"><label class="crest-choice-card"><input type="radio" name="crestMode" value="default" ${selected === 'default' ? 'checked' : ''}><img src="${DEFAULT_TEAM_SHIELD}" alt="" width="1254" height="1254"><span><strong>Escudo padrão TR Campeonatos</strong><small>Usado quando nenhum escudo próprio for enviado.</small></span></label><label class="crest-choice-card"><input type="radio" name="crestMode" value="upload"><span class="crest-upload-icon" aria-hidden="true">↑</span><span><strong>Enviar meu escudo</strong><small>PNG ou JPG/JPEG, até 3 MB.</small></span></label>${editing && currentUrl ? `<label class="crest-choice-card"><input type="radio" name="crestMode" value="current" checked><img src="${escapeHtml(currentUrl)}" alt="" width="1254" height="1254"><span><strong>Manter escudo atual</strong><small>Nenhuma alteração na imagem.</small></span></label>` : ''}</div><label class="crest-file-label" hidden>Selecione PNG ou JPEG<input name="crest" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg"></label><div class="crest-preview"><span>PRÉVIA ${article.toUpperCase()} ${kind.toUpperCase()}</span>${teamShieldMarkup(currentUrl && editing ? currentUrl : null, kind, 'medium', 'eager')}<strong data-crest-preview-name>Nome ${kind === 'equipe' ? 'da equipe' : 'do campeonato'}</strong></div><div class="crest-review" hidden><p>Confira o recorte antes de salvar.</p><label><input type="radio" name="crestVersion" value="processed" checked> Usar imagem otimizada</label><label><input type="radio" name="crestVersion" value="original"> Manter imagem original</label><p class="data-note" data-crest-status role="status"></p></div></fieldset>`;
}

const crestPreparations = new WeakMap<HTMLFormElement, Promise<SmartShieldResult>>();
function installCrestChoice(form: HTMLFormElement) {
  const fileInput = form.querySelector<HTMLInputElement>('input[name="crest"]');
  const preview = form.querySelector<HTMLImageElement>('.crest-preview img');
  const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
  const previewName = form.querySelector<HTMLElement>('[data-crest-preview-name]');
  const current = form.querySelector<HTMLInputElement>('input[name="crestMode"][value="current"]');
  const currentUrl = current?.closest('label')?.querySelector('img')?.src || null;
  let objectUrl: string | null = null;
  let processedUrl: string | null = null;
  let prepared: SmartShieldResult | null = null;
  const review = form.querySelector<HTMLElement>('.crest-review');
  const reviewStatus = form.querySelector<HTMLElement>('[data-crest-status]');
  const update = () => {
    const mode = form.querySelector<HTMLInputElement>('input[name="crestMode"]:checked')?.value || 'default';
    if (fileInput?.parentElement) fileInput.parentElement.hidden = mode !== 'upload';
    if (review) review.hidden = mode !== 'upload' || !prepared?.processed;
    const useProcessed = form.querySelector<HTMLInputElement>('input[name="crestVersion"]:checked')?.value === 'processed';
    if (preview) preview.src = mode === 'upload' && objectUrl ? (useProcessed && processedUrl ? processedUrl : objectUrl) : mode === 'current' && currentUrl ? currentUrl : DEFAULT_TEAM_SHIELD;
    if (previewName) previewName.textContent = nameInput?.value.trim() || 'Nome';
  };
  form.addEventListener('change', (event) => {
    if (event.target === fileInput) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
      objectUrl = fileInput?.files?.[0] ? URL.createObjectURL(fileInput.files[0]) : null;
      processedUrl = null; prepared = null;
      form.querySelector<HTMLInputElement>('input[name="crestMode"][value="upload"]')!.checked = true;
      const file = fileInput?.files?.[0];
      if (file) {
        if (reviewStatus) reviewStatus.textContent = 'Preparando o escudo…';
        const task = prepareSmartShield(file).then((result) => {
          if (fileInput.files?.[0] !== file) return result;
          prepared = result;
          if (result.processed) processedUrl = URL.createObjectURL(result.processed);
          if (reviewStatus) reviewStatus.textContent = result.processed ? 'Recorte pronto. Compare com o original.' : 'Recorte não confiável. O original será mantido.';
          update(); return result;
        }).catch((error) => { if (fileInput.files?.[0] === file && reviewStatus) reviewStatus.textContent = error instanceof Error ? error.message : 'Imagem inválida.'; throw error; });
        crestPreparations.set(form, task);
        void task.catch(() => {});
      }
    }
    update();
  });
  nameInput?.addEventListener('input', update);
  update();
}

async function prepareSelectedCrest(form: HTMLFormElement, file: File) {
  const prepared = await (crestPreparations.get(form) || prepareSmartShield(file));
  if (prepared.source.mime !== 'image/png' && prepared.source.mime !== 'image/jpeg') throw new Error('Selecione PNG ou JPEG.');
  const original = form.querySelector<HTMLInputElement>('input[name="crestVersion"]:checked')?.value === 'original';
  return original ? { ...prepared, status: 'original_fallback' as const, processed: null, meta: { ...prepared.meta, mode: 'original_selected' } } : prepared;
}

async function teamsPage(ctx: Context) {
  let result: any = await ctx.client.from('clubs').select('id,official_name,crest_path,public_background_id,status,created_at,updated_at').eq('organization_id', ctx.organization.id).order('updated_at', { ascending: false });
  if (missingSchemaFeature(result.error)) result = await ctx.client.from('clubs').select('id,official_name,crest_path,status,created_at,updated_at').eq('organization_id', ctx.organization.id).order('updated_at', { ascending: false });
  fail(result.error);
  const teams: any[] = result.data || [];
  const crestUrls = await teamCrestUrls(ctx.client, teams);
  const returnTo = safePanelReturn(new URLSearchParams(location.search).get('retorno'));
  const createForm = editor(ctx.role) ? `<section class="panel-card team-create-card"><div><span class="eyebrow">BANCO PERMANENTE</span><h2>Cadastrar equipe</h2><p>A equipe continua disponível mesmo após o fim de um campeonato.</p></div><form id="team-create-form" class="team-create-form"><label>Nome da equipe<input name="name" minlength="2" maxlength="100" placeholder="Digite o nome da equipe" required></label>${crestChoiceMarkup()}${teamBackgroundChoiceMarkup()}<button class="primary-action" type="submit">Cadastrar equipe</button><p role="status" aria-live="polite"></p></form></section>` : '';
  const cards = teams.map((team) => {
    const crest = crestUrls.get(team.id) || null;
    const archived = team.status === 'archived';
    return `<article class="team-directory-card" data-team-name="${escapeHtml(normalizeTeamSearch(team.official_name))}" data-team-status="${escapeHtml(team.status)}"><div class="team-directory-crest">${teamShieldMarkup(crest, team.official_name, 'medium')}</div><div class="team-directory-copy"><span class="pill">${archived ? 'Arquivada' : 'Ativa'}</span><h2>${escapeHtml(team.official_name)}</h2><p>Identidade permanente da organização.</p></div><div class="team-directory-actions"><a class="secondary-action" href="/painel/equipes/${team.id}">Histórico</a>${editor(ctx.role) ? `<button class="text-button team-edit-toggle" type="button" data-team-id="${team.id}">Editar</button><button class="text-button team-archive" type="button" data-team-id="${team.id}" data-next-status="${archived ? 'pending' : 'archived'}">${archived ? 'Reativar' : 'Arquivar'}</button>` : ''}</div>${editor(ctx.role) ? `<form class="team-edit-form" data-team-id="${team.id}" hidden><label>Nome da equipe<input name="name" minlength="2" maxlength="100" value="${escapeHtml(team.official_name)}" required></label>${crestChoiceMarkup(crest, true)}${teamBackgroundChoiceMarkup(team.public_background_id)}<button class="secondary-action">Salvar alterações</button><p role="status" aria-live="polite"></p></form>` : ''}</article>`;
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
  panelMain().querySelectorAll<HTMLFormElement>('#team-create-form, .team-edit-form').forEach(installCrestChoice);
  panelMain().querySelector<HTMLFormElement>('#team-create-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement, data = new FormData(form), name = String(data.get('name') || '').trim(), crest = data.get('crest'), mode = String(data.get('crestMode') || 'default');
    const message = form.querySelector<HTMLElement>('[role="status"]')!;
    if (name.length < 2) { message.textContent = 'Informe o nome da equipe.'; return; }
    let prepared: SmartShieldResult | undefined;
    if (mode === 'upload') {
      if (!(crest instanceof File) || !crest.size) { message.textContent = 'Selecione um PNG ou JPEG para o escudo próprio.'; return; }
      try { message.textContent = 'Validando o escudo…'; prepared = await prepareSelectedCrest(form, crest); }
      catch (error) { message.textContent = error instanceof Error ? error.message : 'Não foi possível validar o escudo.'; return; }
    }
    const submit = form.querySelector<HTMLButtonElement>('button')!; submit.disabled = true;
    const backgroundId = Number(data.get('public_background_id'));
    const public_background_id = Number.isInteger(backgroundId) && backgroundId >= 1 && backgroundId <= 20 ? backgroundId : null;
    const created = await ctx.client.from('clubs').insert({ official_name: name, slug: `${slug(name)}-${Math.random().toString(36).slice(2, 8)}`, sport: 'Futebol', organization_id: ctx.organization.id, created_by: ctx.user.id, status: 'pending', public_background_id }).select('id').single();
    if (created.error) { message.textContent = created.error.message.includes('clubs_organization_name_active_unique') ? 'Já existe uma equipe com esse nome nesta organização.' : created.error.message; submit.disabled = false; return; }
    try {
      if (mode === 'upload' && crest instanceof File) {
        const saved = await storeSmartShield(ctx.client, created.data.id, crest, prepared);
        message.textContent = saved.notice;
      } else message.textContent = 'Equipe cadastrada com o escudo padrão TR Campeonatos.';
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
    const teamId = form.dataset.teamId || '', data = new FormData(form), name = String(data.get('name') || '').trim(), crest = data.get('crest'), mode = String(data.get('crestMode') || 'default'), message = form.querySelector<HTMLElement>('[role="status"]')!;
    if (!safeId(teamId) || name.length < 2) { message.textContent = 'Informe um nome válido.'; return; }
    let prepared: SmartShieldResult | undefined;
    if (mode === 'upload') {
      if (!(crest instanceof File) || !crest.size) { message.textContent = 'Selecione um PNG ou JPEG para o escudo próprio.'; return; }
      try { prepared = await prepareSelectedCrest(form, crest); }
      catch (error) { message.textContent = error instanceof Error ? error.message : 'Escudo inválido.'; return; }
    }
    const backgroundId = Number(data.get('public_background_id'));
    const public_background_id = Number.isInteger(backgroundId) && backgroundId >= 1 && backgroundId <= 20 ? backgroundId : null;
    const update = await ctx.client.from('clubs').update({ official_name: name, public_background_id }).eq('id', teamId).eq('organization_id', ctx.organization.id);
    if (update.error) { message.textContent = update.error.message; return; }
    if (mode === 'upload' && crest instanceof File) {
      try { message.textContent = 'Atualizando o escudo…'; await storeSmartShield(ctx.client, teamId, crest, prepared); }
      catch (error) { message.textContent = error instanceof Error ? error.message : 'Nome salvo, mas o escudo não foi atualizado.'; return; }
    } else if (mode === 'default') {
      const reset = await ctx.client.from('clubs').update({ crest_path: null }).eq('id', teamId).eq('organization_id', ctx.organization.id);
      if (reset.error) { message.textContent = reset.error.message; return; }
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
  let result: any = await ctx.client.from('competitions').select('id,name,sport,status,visibility,updated_at,crest_path').eq('organization_id', ctx.organization.id).order('updated_at', { ascending: false });
  if (missingSchemaFeature(result.error)) result = await ctx.client.from('competitions').select('id,name,sport,status,visibility,updated_at').eq('organization_id', ctx.organization.id).order('updated_at', { ascending: false });
  fail(result.error);
  return Promise.all((result.data || []).map(async (item: any) => ({ ...item, crestUrl: await signedCompetitionShield(ctx.client, item.crest_path) })));
}

const competitionStatusLabel = (status: string) => ({ draft: 'Em preparação', active: 'Em andamento', archived: 'Arquivado' } as Record<string, string>)[status] || status;

const competitionFinished = (competitionId: string, seasons: any[]) => {
  const own = seasons.filter((season) => season.competition_id === competitionId);
  return own.length > 0 && own.every((season) => season.status === 'completed');
};

function competitionCard(ctx: Context, item: any, teamCount: number, finished = false) {
  const archived = item.status === 'archived';
  const canEdit = editor(ctx.role);
  const displayStatus = archived ? 'archived' : finished ? 'completed' : item.status;
  return `<article class="panel-card competition-card" data-competition-id="${item.id}" data-name="${escapeHtml(normalizeTeamSearch(item.name))}" data-status="${displayStatus}"><div class="competition-card-art" >${competitionShieldMarkup(item.crestUrl, item.name)}</div><div class="competition-card-body"><div class="competition-card-top"><span class="pill">${displayStatus === 'completed' ? 'Finalizado' : escapeHtml(competitionStatusLabel(displayStatus))}</span>${canEdit ? `<button class="competition-menu-toggle" type="button" aria-label="Ações de ${escapeHtml(item.name)}" aria-expanded="false" aria-haspopup="menu" data-menu-toggle="${item.id}">⋮</button>` : ''}</div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.sport)}</p><span class="competition-team-count">${teamCount} ${teamCount === 1 ? 'equipe' : 'equipes'}</span><a class="primary-action competition-open" href="/painel/campeonatos/${item.id}">Acessar campeonato</a></div>${canEdit ? `<div class="competition-menu" role="menu" hidden data-menu="${item.id}"><a role="menuitem" href="/painel/campeonatos/${item.id}/resultados">Ver partida</a><a role="menuitem" href="/painel/campeonatos/${item.id}/resultados#team-selection">Selecionar equipes</a><a role="menuitem" href="/painel/campeonatos/${item.id}/resultados">Editar resultado</a><a role="menuitem" href="/painel/campeonatos/${item.id}">Editar informações</a><button role="menuitem" type="button" data-competition-action="share" data-id="${item.id}">Compartilhar</button><div class="competition-menu-danger"><button role="menuitem" type="button" data-competition-action="restore" data-id="${item.id}" ${archived ? '' : 'disabled title="Disponível apenas para campeonatos arquivados"'}>Restaurar</button><button role="menuitem" type="button" data-competition-action="remove" data-id="${item.id}" ${archived ? 'disabled title="Campeonato já arquivado"' : ''}>Remover</button></div></div>` : ''}</article>`;
}

function installCompetitionMenus(ctx: Context, competitions: any[]) {
  const root = panelMain();
  const closeMenus = () => root.querySelectorAll<HTMLElement>('.competition-menu').forEach((menu) => { menu.hidden = true; root.querySelector<HTMLButtonElement>(`[data-menu-toggle="${menu.dataset.menu}"]`)?.setAttribute('aria-expanded', 'false'); });
  root.querySelectorAll<HTMLButtonElement>('[data-menu-toggle]').forEach((toggle) => toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = root.querySelector<HTMLElement>(`[data-menu="${toggle.dataset.menuToggle}"]`);
    const shouldOpen = Boolean(menu?.hidden); closeMenus(); if (menu) { menu.hidden = !shouldOpen; toggle.setAttribute('aria-expanded', String(shouldOpen)); }
  }));
  document.addEventListener('click', (event) => { if (!(event.target as Element).closest('.competition-menu')) closeMenus(); });
  root.querySelectorAll<HTMLButtonElement>('[data-competition-action]').forEach((button) => button.addEventListener('click', async () => {
    const item = competitions.find((competition) => competition.id === button.dataset.id);
    if (!item) return;
    const action = button.dataset.competitionAction;
    if (action === 'share') {
      if (item.visibility !== 'public') { window.alert('O campeonato está privado. Publique-o nas informações antes de compartilhar.'); return; }
      const url = `${location.origin}/c/${item.id}`;
      try { await navigator.clipboard.writeText(url); window.alert('Link público copiado.'); }
      catch { window.prompt('Copie o endereço público:', url); }
      return;
    }
    if (action !== 'remove' && action !== 'restore') return;
    const archive = action === 'remove';
    if (!window.confirm(archive ? `Arquivar ${item.name}? Equipes, partidas e histórico serão preservados.` : `Restaurar ${item.name}?`)) return;
    button.disabled = true;
    const result = await ctx.client.rpc('set_competition_archive', { target_competition: item.id, make_archived: archive });
    if (result.error) { button.disabled = false; window.alert(missingSchemaFeature(result.error) ? 'Arquivar e restaurar dependem da migração 202610250006 no Supabase.' : result.error.message); }
    else location.reload();
  }));
}

async function dashboard(ctx: Context) {
  const competitions = await organizationCompetitions(ctx);
  const ids = competitions.map((item) => item.id);
  let entries: any[] = [], matches: any[] = [], seasons: any[] = [];
  const clubsResult = await ctx.client.from('clubs').select('id').eq('organization_id', ctx.organization.id).neq('status', 'archived');
  fail(clubsResult.error);
  if (ids.length) {
    const seasonQuery = await ctx.client.from('competition_seasons').select('id,competition_id,status').in('competition_id', ids);
    fail(seasonQuery.error); seasons = seasonQuery.data || [];
    if (seasons.length) {
      const seasonIds = seasons.map((item) => item.id);
      const [entryQuery, matchQuery] = await Promise.all([
        ctx.client.from('competition_entries').select('id,season_id,club_id,club_name_snapshot').in('season_id', seasonIds),
        ctx.client.from('matches').select('id,season_id,home_entry_id,away_entry_id,status,home_score,away_score,scheduled_at').in('season_id', seasonIds),
      ]);
      fail(entryQuery.error); fail(matchQuery.error);
      entries = entryQuery.data || []; matches = matchQuery.data || [];
    }
  }
  const confirmed = matches.filter((match) => match.status === 'confirmed');
  const upcoming = matches.filter((match) => match.status === 'scheduled' && match.scheduled_at && new Date(match.scheduled_at).getTime() >= Date.now()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const metrics = [
    ['Campeonatos ativos', competitions.filter((item) => item.status === 'active' && !competitionFinished(item.id, seasons)).length],
    ['Equipes cadastradas', clubsResult.data?.length || 0],
    ['Partidas realizadas', confirmed.length],
    ['Próximos confrontos', upcoming.length],
    ['Campeonatos finalizados', competitions.filter((competition) => competitionFinished(competition.id, seasons) && competition.status !== 'archived').length],
  ];
  const featuredCompetition = competitions.find((item) => item.status === 'active' && !competitionFinished(item.id, seasons));
  const featuredSeasonIds = new Set(seasons.filter((season) => season.competition_id === featuredCompetition?.id).map((season) => season.id));
  const featuredMatches = matches.filter((match) => featuredSeasonIds.has(match.season_id));
  const entryNames = new Map(entries.map((entry) => [entry.id, entry.club_name_snapshot]));
  const nextMatch = featuredMatches.filter((match) => match.status === 'scheduled' && match.scheduled_at && new Date(match.scheduled_at).getTime() >= Date.now()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  const lastMatch = featuredMatches.filter((match) => match.status === 'confirmed').sort((a, b) => (b.scheduled_at || '').localeCompare(a.scheduled_at || ''))[0];
  const pairing = (match: any) => `${escapeHtml(entryNames.get(match.home_entry_id) || 'Equipe indisponível')} × ${escapeHtml(entryNames.get(match.away_entry_id) || 'Equipe indisponível')}`;
  const featuredHtml = featuredCompetition ? `<section class="panel-card featured-competition"><div><span>CAMPEONATO EM DESTAQUE</span><h2>${escapeHtml(featuredCompetition.name)}</h2><p>${escapeHtml(featuredCompetition.sport)} · ${featuredCompetition.visibility === 'public' ? 'Publicado' : 'Privado'}</p><a href="/painel/campeonatos/${featuredCompetition.id}">Gerenciar campeonato →</a>${featuredCompetition.visibility === 'public' ? `<a href="/c/${featuredCompetition.id}" target="_blank" rel="noopener noreferrer">Abrir portal público →</a>` : ''}</div><div class="featured-results"><div><small>PRÓXIMO CONFRONTO</small><strong>${nextMatch ? pairing(nextMatch) : 'Nenhum confronto agendado'}</strong><span>${nextMatch ? escapeHtml(readableDate(nextMatch.scheduled_at)) : 'Cadastre a próxima partida no campeonato.'}</span></div><div><small>ÚLTIMO RESULTADO</small><strong>${lastMatch ? pairing(lastMatch) : 'Nenhum resultado confirmado'}</strong><span>${lastMatch ? `${lastMatch.home_score} × ${lastMatch.away_score}` : 'Os resultados aparecerão após a confirmação.'}</span></div></div></section>` : '';
  const teamCount = (competitionId: string) => new Set(entries.filter((entry) => seasons.some((season) => season.id === entry.season_id && season.competition_id === competitionId)).map((entry) => entry.club_id)).size;
  panelMain().innerHTML = `${panelHeading('PAINEL DO ORGANIZADOR', 'Visão geral', `Organização: ${ctx.organization.name}`, editor(ctx.role) ? '<a class="primary-action" href="/painel/campeonatos/novo">+ Criar campeonato</a>' : '')}<div class="metric-grid">${metrics.map(([label, value]) => `<article class="panel-card metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('')}</div>${featuredHtml}<section class="competition-section"><div class="card-head"><div><h2>Suas competições</h2><p>Gerencie seus campeonatos e acompanhe os jogos.</p></div><a href="/painel/campeonatos">Ver todas →</a></div>${competitions.length ? `<div class="competition-grid">${competitions.slice(0, 4).map((item) => competitionCard(ctx, item, teamCount(item.id), competitionFinished(item.id, seasons))).join('')}</div>` : `<div class="panel-card empty-state"><h2>Ainda não criou um campeonato?</h2><p>Comece agora e organize sua competição.</p>${editor(ctx.role) ? '<a class="primary-action" href="/painel/campeonatos/novo">Criar meu primeiro campeonato</a>' : ''}</div>`}</section>`;
  installCompetitionMenus(ctx, competitions);
}

async function competitionList(ctx: Context) {
  const competitions = await organizationCompetitions(ctx);
  let seasons: any[] = [], entries: any[] = [];
  if (competitions.length) {
    const loaded = await ctx.client.from('competition_seasons').select('id,competition_id').in('competition_id', competitions.map((item) => item.id));
    fail(loaded.error); seasons = loaded.data || [];
    if (seasons.length) {
      const participantResult = await ctx.client.from('competition_entries').select('season_id,club_id').in('season_id', seasons.map((season) => season.id));
      fail(participantResult.error); entries = participantResult.data || [];
    }
  }
  const teamCount = (competitionId: string) => new Set(entries.filter((entry) => seasons.some((season) => season.id === entry.season_id && season.competition_id === competitionId)).map((entry) => entry.club_id)).size;
  panelMain().innerHTML = `${panelHeading('GESTÃO DE COMPETIÇÕES', 'Campeonatos', 'Competições vinculadas à sua organização.', editor(ctx.role) ? '<a class="primary-action" href="/painel/campeonatos/novo">+ Criar campeonato</a>' : '')}${competitions.length ? `<div class="competition-toolbar"><label>Buscar campeonato<input id="competition-search" type="search" placeholder="Buscar campeonato…" autocomplete="off"></label><label>Status<select id="competition-status"><option value="">Todos os status</option><option value="draft">Em preparação</option><option value="active">Em andamento</option><option value="completed">Finalizado</option><option value="archived">Arquivado</option></select></label></div><div class="competition-grid">${competitions.map((item) => competitionCard(ctx, item, teamCount(item.id), competitionFinished(item.id, seasons))).join('')}</div><p id="competition-empty-filter" class="data-note" hidden>Nenhum campeonato encontrado.</p>` : `<div class="panel-card empty-state"><h2>Nenhum campeonato cadastrado</h2><p>Crie a primeira competição para começar.</p>${editor(ctx.role) ? '<a class="primary-action" href="/painel/campeonatos/novo">Criar meu primeiro campeonato</a>' : ''}</div>`}`;
  installCompetitionMenus(ctx, competitions);
  const applyFilter = () => {
    const needle = normalizeTeamSearch(panelMain().querySelector<HTMLInputElement>('#competition-search')?.value || '');
    const status = panelMain().querySelector<HTMLSelectElement>('#competition-status')?.value || '';
    let visible = 0;
    panelMain().querySelectorAll<HTMLElement>('.competition-card').forEach((card) => { const matches = (!needle || (card.dataset.name || '').includes(needle)) && (!status || card.dataset.status === status); card.hidden = !matches; if (matches) visible += 1; });
    const emptyFilter = panelMain().querySelector<HTMLElement>('#competition-empty-filter'); if (emptyFilter) emptyFilter.hidden = visible > 0;
  };
  panelMain().querySelector('#competition-search')?.addEventListener('input', applyFilter);
  panelMain().querySelector('#competition-status')?.addEventListener('change', applyFilter);
}

function newCompetition(ctx: Context) {
  if (!editor(ctx.role)) { panelMain().innerHTML = empty('Acesso restrito', 'Sua função nesta organização permite apenas visualizar competições.'); return; }
  panelMain().innerHTML = `${panelHeading('NOVA COMPETIÇÃO', 'Criar campeonato', 'Escolha o tipo, informe o nome e adicione o escudo se quiser.')}<div class="panel-card empty-state"><h2>Comece em dois passos</h2><p>Escolha o tipo e informe o nome. Depois, adicione as equipes e monte as partidas.</p><button id="start-competition" class="primary-action" type="button">+ Criar campeonato</button></div><dialog id="competition-type-dialog" class="competition-dialog" aria-labelledby="competition-type-title"><div class="dialog-heading"><span>ETAPA 1 DE 2</span><button type="button" data-close-dialog aria-label="Fechar">×</button></div><h2 id="competition-type-title">Tipo de campeonato</h2><p>Escolha como o campeonato será organizado.</p><div class="competition-kind-grid"><button type="button" data-kind="single"><strong>Campeonato único</strong><span>Uma modalidade e uma categoria.</span><small>Futebol, futsal ou torneio eliminatório.</small></button><button type="button" data-kind="corujao"><strong>Modo Corujão</strong><span>E-sports com fase de grupos e eliminatórias.</span><small>As rodadas serão montadas conforme a quantidade de equipes.</small></button><button type="button" data-kind="categories"><strong>Campeonato com categorias</strong><span>Mais de uma categoria no mesmo campeonato.</span><small>Sub-15 e Sub-17, masculino e feminino, divisões distintas.</small></button></div><button type="button" class="secondary-action" data-close-dialog>Cancelar</button></dialog><dialog id="competition-details-dialog" class="competition-dialog" aria-labelledby="competition-details-title"><div class="dialog-heading"><span>ETAPA 2 DE 2</span><button type="button" data-close-dialog aria-label="Fechar">×</button></div><h2 id="competition-details-title">Novo campeonato</h2><form id="new-competition"><input type="hidden" name="kind" value="single"><label>Nome do campeonato<input name="name" minlength="3" maxlength="120" autofocus required></label>${crestChoiceMarkup(null, false, 'campeonato')}<fieldset class="phase-choice"><legend>Fases do campeonato</legend><label><input type="radio" name="format" value="round_robin" checked><span><strong>Pontos corridos</strong><small>Classificação por pontos.</small></span></label><label><input type="radio" name="format" value="groups_knockout"><span><strong>Pontos corridos + Eliminatórias</strong><small>Fase classificatória seguida por mata-mata.</small></span></label><label><input type="radio" name="format" value="knockout"><span><strong>Eliminatórias</strong><small>Confrontos diretos.</small></span></label></fieldset><details><summary>Modalidade e edição</summary><label>Modalidade<select name="sport"><option>Futebol</option><option>Futsal</option><option>Vôlei</option><option>Basquete</option><option>E-sports</option></select></label><label>Edição<input name="season" minlength="2" maxlength="40" value="${new Date().getFullYear()}" required></label></details><p class="data-note" id="format-capability">O campeonato começará em preparação e privado. Nenhum confronto será gerado automaticamente.</p><div class="dialog-actions"><button class="secondary-action" type="button" data-close-dialog>Cancelar</button><button class="primary-action" type="submit">Criar campeonato</button></div><p id="form-message" role="status" aria-live="polite"></p></form></dialog>`;
  installCrestChoice(panelMain().querySelector<HTMLFormElement>('#new-competition')!);
  const typeDialog = panelMain().querySelector<HTMLDialogElement>('#competition-type-dialog')!;
  const detailsDialog = panelMain().querySelector<HTMLDialogElement>('#competition-details-dialog')!;
  panelMain().querySelector('#start-competition')?.addEventListener('click', () => typeDialog.showModal());
  panelMain().querySelectorAll<HTMLButtonElement>('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => { button.closest('dialog')?.close(); }));
  panelMain().querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((button) => button.addEventListener('click', () => {
    const corujao = button.dataset.kind === 'corujao';
    panelMain().querySelector<HTMLFormElement>('#new-competition')!.dataset.preset = corujao ? 'corujao' : '';
    panelMain().querySelector<HTMLInputElement>('#new-competition [name="kind"]')!.value = button.dataset.kind === 'categories' ? 'categories' : 'single';
    panelMain().querySelector<HTMLSelectElement>('#new-competition [name="sport"]')!.value = corujao ? 'E-sports' : 'Futebol';
    panelMain().querySelector<HTMLInputElement>(`#new-competition [name="format"][value="${corujao ? 'groups_knockout' : 'round_robin'}"]`)!.checked = true;
    panelMain().querySelector<HTMLElement>('.phase-choice')!.hidden = corujao;
    panelMain().querySelector<HTMLElement>('#new-competition details')!.hidden = corujao;
    panelMain().querySelector<HTMLElement>('#format-capability')!.textContent = corujao
      ? 'Modo Corujão: o planejador monta grupos e confrontos. A progressão oficial até o campeão está validada para 8 equipes em dois grupos de quatro. Outros tamanhos aguardam regulamento de classificação.'
      : 'O campeonato começará em preparação e privado. Nenhum confronto será gerado automaticamente.';
    typeDialog.close(); detailsDialog.showModal();
  }));
  panelMain().querySelectorAll<HTMLInputElement>('#new-competition input[name="format"]').forEach((radio) => radio.addEventListener('change', () => {
    panelMain().querySelector<HTMLElement>('#format-capability')!.textContent = radio.value === 'round_robin' ? 'O calendário será configurado após selecionar as equipes. A competição ficará privada e em preparação.' : 'Grupos e chaveamento oficial ainda exigem configuração posterior. Nenhum confronto será criado agora.';
  }));
  panelMain().querySelector<HTMLFormElement>('#new-competition')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    const name = String(fields.get('name') || '').trim();
    const label = String(fields.get('season') || '').trim();
    const sport = form.dataset.preset === 'corujao' ? 'E-sports' : String(fields.get('sport') || '');
    const format = form.dataset.preset === 'corujao' ? 'groups_knockout' : String(fields.get('format') || '');
    const kind = String(fields.get('kind') || 'single');
    const crest = fields.get('crest');
    const crestMode = String(fields.get('crestMode') || 'default');
    const message = panelMain().querySelector<HTMLElement>('#form-message')!;
    if (name.length < 3 || label.length < 2) { message.textContent = 'Confira o nome e a temporada.'; return; }
    let prepared: SmartShieldResult | undefined;
    if (crestMode === 'upload') {
      if (!(crest instanceof File) || !crest.size) { message.textContent = 'Selecione um PNG ou JPEG para o escudo.'; return; }
      try { prepared = await prepareSelectedCrest(form, crest); }
      catch (error) { message.textContent = error instanceof Error ? error.message : 'Escudo inválido.'; return; }
    }
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true; message.textContent = 'Criando campeonato…';
    const corujao = form.dataset.preset === 'corujao';
    let created = corujao
      ? await ctx.client.rpc('create_competition_mode', { target_organization: ctx.organization.id, target_name: name, target_sport: sport, target_season_label: label, target_format: format, target_kind: kind, target_mode: 'corujao' })
      : await ctx.client.rpc('create_competition_setup', { target_organization: ctx.organization.id, target_name: name, target_sport: sport, target_season_label: label, target_format: format, target_kind: kind });
    if (created.error && missingSchemaFeature(created.error) && corujao) {
      message.textContent = 'O Modo Corujão requer a migração 202610270002 no Supabase. Nenhum campeonato foi criado.';
      submit.disabled = false; return;
    }
    if (created.error && missingSchemaFeature(created.error) && kind === 'single') {
      created = await ctx.client.rpc('create_competition_with_season', { target_organization: ctx.organization.id, target_name: name, target_sport: sport, target_season_label: label, target_format: format });
    }
    if (created.error && missingSchemaFeature(created.error) && kind === 'categories') {
      message.textContent = 'A criação com categorias depende da migração 202610250006 no Supabase. Nenhum campeonato foi criado.';
      submit.disabled = false; return;
    }
    if (created.error) { message.textContent = created.error.message; submit.disabled = false; return; }
    if (crestMode === 'upload' && crest instanceof File && prepared) {
      try { message.textContent = 'Salvando escudo…'; await storeCompetitionShield(ctx, created.data.id, crest, prepared); }
      catch (error) { message.textContent = `Campeonato criado, mas o escudo não foi salvo: ${error instanceof Error ? error.message : 'erro desconhecido'}. Edite as informações para tentar novamente.`; submit.disabled = false; return; }
    }
    location.assign(corujao ? `/painel/campeonatos/${created.data.id}/resultados` : `/painel/campeonatos/${created.data.id}`);
  });
}

async function getCompetition(ctx: Context, id: string) {
  const result = await ctx.client.from('competitions').select('id,name,sport,status,visibility,organization_id,competition_kind,default_format,setup_mode,subtitle,description,accent_color,regulation,prizes,location_mode,venue,starts_on,ends_on').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
  let data = result.data;
  if (missingSchemaFeature(result.error)) {
    const previous = await ctx.client.from('competitions').select('id,name,sport,status,visibility,organization_id,competition_kind,default_format,subtitle,description,accent_color,regulation,prizes,location_mode,venue,starts_on,ends_on').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
    if (!previous.error) data = previous.data ? { ...previous.data, setup_mode: 'standard' } : null;
    else {
      if (!missingSchemaFeature(previous.error)) fail(previous.error);
      const legacy = await ctx.client.from('competitions').select('id,name,sport,status,visibility,organization_id').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
      fail(legacy.error);
      return legacy.data ? {
        ...legacy.data, __extendedSchema: false, competition_kind: 'single', default_format: 'round_robin', setup_mode: 'standard',
        subtitle: null, description: null, accent_color: '#0878E8', regulation: null, prizes: null,
        location_mode: 'online', venue: null, starts_on: null, ends_on: null, crest_path: null,
      } : null;
    }
  } else fail(result.error);
  if (!data) return null;
  const crest = await ctx.client.from('competitions').select('crest_path').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
  return { ...data, crest_path: crest.error ? null : crest.data?.crest_path, __extendedSchema: true };
}

async function competitionDetail(ctx: Context, id: string) {
  const competition = await getCompetition(ctx, id);
  if (!competition) { panelMain().innerHTML = empty('Campeonato não encontrado', 'Confira o endereço ou a permissão da sua conta.'); return; }
  const seasonsQuery = await ctx.client.from('competition_seasons').select('id,label,category,format,status,starts_on,ends_on').eq('competition_id', id).order('created_at', { ascending: false });
  fail(seasonsQuery.error);
  const seasons = seasonsQuery.data || [];
  const isCategoryCompetition = competition.competition_kind === 'categories';
  const canEdit = editor(ctx.role) && competition.status !== 'archived';
  panelMain().innerHTML = `${panelHeading('INFORMAÇÕES DO CAMPEONATO', competition.name, `${competition.sport} · ${competitionStatusLabel(competition.status)} · ${competition.visibility === 'public' ? 'Público' : 'Privado'}`, competition.visibility === 'public' ? `<a class="secondary-action" href="/c/${id}" target="_blank" rel="noopener noreferrer">Abrir página pública</a>` : '')}<div class="panel-card"><div class="card-head"><h2>${isCategoryCompetition ? 'Categorias' : 'Edições'}</h2>${canEdit ? `<button id="show-season-form" class="secondary-action" type="button">${isCategoryCompetition ? 'Adicionar categoria' : 'Adicionar edição'}</button>` : ''}</div>${seasons.length ? `<div class="list-links">${seasons.map((season) => `<div><strong>${escapeHtml(season.category || season.label)}</strong><span>${escapeHtml(season.format)} · ${escapeHtml(season.status)}</span><a href="/painel/campeonatos/${id}/resultados?temporada=${season.id}">Partidas e resultados →</a></div>`).join('')}</div>` : `<p>${isCategoryCompetition ? 'Adicione a primeira categoria para selecionar participantes.' : 'Nenhuma edição cadastrada.'}</p>`}<form id="season-form" hidden><label>${isCategoryCompetition ? 'Nome da categoria' : 'Nome da edição'}<input name="label" minlength="2" maxlength="40" required></label><label>Formato<select name="format"><option value="round_robin">Pontos corridos</option><option value="knockout">Mata-mata</option><option value="groups_knockout">Grupos e mata-mata</option></select></label><button class="primary-action" type="submit">${isCategoryCompetition ? 'Salvar categoria' : 'Salvar edição'}</button><p role="status"></p></form></div><div class="panel-card"><h2>Ações da competição</h2><div class="action-links"><a href="/painel/campeonatos/${id}/resultados">Editar resultados</a>${competition.visibility === 'public' ? `<button id="copy-public-link" class="secondary-action" type="button">Copiar link público</button><span id="copy-public-status" role="status"></span>` : '<span>Publicação: privada</span>'}</div></div>`;
  const defaultFormatSelect = panelMain().querySelector<HTMLSelectElement>('#season-form select[name="format"]');
  if (defaultFormatSelect) defaultFormatSelect.value = competition.default_format || 'round_robin';
  const competitionCrestUrl = await signedCompetitionShield(ctx.client, competition.crest_path);
  const settings = `<section class="panel-card competition-settings"><h2>Informações básicas</h2><form id="competition-settings-form"><label>Nome do campeonato<input name="name" minlength="3" maxlength="120" value="${escapeHtml(competition.name)}" required ${canEdit ? '' : 'disabled'}></label>${crestChoiceMarkup(competitionCrestUrl, true, 'campeonato')}<label>Subtítulo opcional<input name="subtitle" maxlength="160" value="${escapeHtml(competition.subtitle || '')}" ${canEdit ? '' : 'disabled'}></label><label>Descrição<textarea name="description" maxlength="3000" rows="4" ${canEdit ? '' : 'disabled'}>${escapeHtml(competition.description || '')}</textarea></label><div class="settings-two"><label>Data de início<input name="starts_on" type="date" value="${escapeHtml(competition.starts_on || '')}" ${canEdit ? '' : 'disabled'}></label><label>Data de término<input name="ends_on" type="date" value="${escapeHtml(competition.ends_on || '')}" ${canEdit ? '' : 'disabled'}></label></div><h3>Personalização</h3><label>Cor de destaque<input name="accent_color" type="color" value="${escapeHtml(competition.accent_color || '#0878E8')}" ${canEdit ? '' : 'disabled'}></label><h3>Regulamento e premiações</h3><label>Regulamento<textarea name="regulation" maxlength="10000" rows="5" ${canEdit ? '' : 'disabled'}>${escapeHtml(competition.regulation || '')}</textarea></label><label>Premiações<textarea name="prizes" maxlength="3000" rows="3" ${canEdit ? '' : 'disabled'}>${escapeHtml(competition.prizes || '')}</textarea></label><h3>Localização</h3><label>Tipo de competição<select name="location_mode" ${canEdit ? '' : 'disabled'}><option value="online" ${competition.location_mode !== 'presential' ? 'selected' : ''}>Online</option><option value="presential" ${competition.location_mode === 'presential' ? 'selected' : ''}>Presencial</option></select></label><label>Local, se presencial<input name="venue" maxlength="300" value="${escapeHtml(competition.venue || '')}" ${canEdit ? '' : 'disabled'}></label>${canEdit ? '<button class="primary-action" type="submit">Salvar informações</button>' : ''}<p role="status" aria-live="polite"></p></form></section>`;
  if (competition.__extendedSchema) panelMain().querySelector('.panel-card')?.insertAdjacentHTML('beforebegin', settings);
  else panelMain().querySelector('.panel-card')?.insertAdjacentHTML('beforebegin', '<div class="panel-card"><h2>Informações do campeonato</h2><p>A edição ampliada depende da migração 202610250006 no Supabase. As edições, equipes e partidas existentes continuam disponíveis.</p></div>');
  const settingsForm = panelMain().querySelector<HTMLFormElement>('#competition-settings-form');
  if (settingsForm) installCrestChoice(settingsForm);
  panelMain().querySelector<HTMLFormElement>('#competition-settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canEdit) return;
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    const start = String(fields.get('starts_on') || '') || null;
    const end = String(fields.get('ends_on') || '') || null;
    const status = form.querySelector<HTMLElement>('[role="status"]')!;
    if (start && end && end < start) { status.textContent = 'A data de término deve ser posterior ao início.'; return; }
    const crestMode = String(fields.get('crestMode') || 'current');
    const crestFile = fields.get('crest');
    let prepared: SmartShieldResult | undefined;
    if (crestMode === 'upload') {
      if (!(crestFile instanceof File) || !crestFile.size) { status.textContent = 'Selecione um PNG ou JPEG para o escudo.'; return; }
      try { prepared = await prepareSelectedCrest(form, crestFile); }
      catch (error) { status.textContent = error instanceof Error ? error.message : 'Escudo inválido.'; return; }
    }
    const locationMode = String(fields.get('location_mode') || 'online');
    const payload = {
      name: String(fields.get('name') || '').trim(), subtitle: String(fields.get('subtitle') || '').trim() || null,
      description: String(fields.get('description') || '').trim() || null,
      accent_color: String(fields.get('accent_color') || '#0878E8'),
      regulation: String(fields.get('regulation') || '').trim() || null,
      prizes: String(fields.get('prizes') || '').trim() || null,
      location_mode: locationMode, venue: locationMode === 'presential' ? String(fields.get('venue') || '').trim() || null : null,
      starts_on: start, ends_on: end,
    };
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true; status.textContent = 'Salvando informações…';
    const result = await ctx.client.from('competitions').update(payload).eq('id', id).eq('organization_id', ctx.organization.id);
    if (result.error) { button.disabled = false; status.textContent = result.error.message; return; }
    if (crestMode === 'upload' && crestFile instanceof File && prepared) {
      try { status.textContent = 'Salvando escudo…'; await storeCompetitionShield(ctx, id, crestFile, prepared); }
      catch (error) { button.disabled = false; status.textContent = `Informações salvas, mas o escudo falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}`; return; }
    } else if (crestMode === 'default' && competition.crest_path) {
      const reset = await ctx.client.from('competitions').update({ crest_path: null, crest_original_path: null, crest_processed_path: null }).eq('id', id).eq('organization_id', ctx.organization.id);
      if (reset.error) { button.disabled = false; status.textContent = reset.error.message; return; }
    }
    button.disabled = false;
    status.textContent = 'Informações salvas.';
  });
  panelMain().querySelector('#copy-public-link')?.addEventListener('click', async () => {
    const publicUrl = `${location.origin}/c/${id}`;
    const status = panelMain().querySelector<HTMLElement>('#copy-public-status')!;
    try { await navigator.clipboard.writeText(publicUrl); status.textContent = 'Link público copiado.'; }
    catch { status.textContent = `Copie este endereço: ${publicUrl}`; }
  });  if (canEdit) {
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
    const label = String(fields.get('label') || '').trim();
    const result = await ctx.client.from('competition_seasons').insert({ competition_id: id, label: isCategoryCompetition ? String(new Date().getFullYear()) : label, category: isCategoryCompetition ? label : null, format: fields.get('format'), status: 'draft' });
    if (result.error) form.querySelector<HTMLElement>('[role="status"]')!.textContent = result.error.message;
    else location.reload();
  });
}

async function resultEditor(ctx: Context, id: string) {
  const competition = await getCompetition(ctx, id);
  if (!competition) { panelMain().innerHTML = empty('Campeonato não encontrado', 'Confira o endereço ou a permissão da sua conta.'); return; }
  const canEdit = editor(ctx.role) && competition.status !== 'archived';
  const seasonResult = await ctx.client.from('competition_seasons').select('*').eq('competition_id', id).order('created_at', { ascending: false });
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
  const activeEntries = entries.filter((entry) => entry.status === 'confirmed');
  const matches = matchResult.data || [];
  const penaltyResult = matches.length ? await ctx.client.from('penalty_shootouts').select('match_id,home_score,away_score,winning_entry_id').in('match_id', matches.map((match) => match.id)) : null;
  if (penaltyResult) fail(penaltyResult.error);
  const penaltiesByMatch = new Map((penaltyResult?.data || []).map((item) => [item.match_id, item]));
  const names = new Map(entries.map((entry) => [entry.id, entry.club_name_snapshot]));
  panelMain().innerHTML = `${panelHeading('CENTRAL DE PARTIDAS', competition.name, `${selected.category || selected.label} · resultados oficiais`)}<div class="panel-card"><div class="filter-row"><label>Temporada<select id="season-select">${seasons.map((season) => `<option value="${season.id}" ${season.id === selected.id ? 'selected' : ''}>${escapeHtml(season.category || season.label)}</option>`).join('')}</select></label><label>Situação<select id="status-filter"><option value="">Todas</option><option value="scheduled">Agendadas</option><option value="in_progress">Em andamento</option><option value="completed">Finalizadas</option><option value="confirmed">Confirmadas</option></select></label><label>Rodada<input id="round-filter" type="number" min="1" placeholder="Todas"></label><label>Equipe<select id="team-filter"><option value="">Todas</option>${activeEntries.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.club_name_snapshot)}</option>`).join('')}</select></label><label>Fase<select id="phase-filter"><option value="">Todas</option><option value="league">Liga</option><option value="groups">Grupos</option><option value="round_of_16">Oitavas</option><option value="quarterfinal">Quartas</option><option value="semifinal">Semifinal</option><option value="final">Final</option></select></label><label>Data<input id="date-filter" type="date"></label></div></div><div id="match-list">${matches.length ? matches.map((match) => `<article class="panel-card match-row" data-status="${match.status}" data-round="${match.round_number ?? ''}" data-phase="${match.phase}" data-date="${match.scheduled_at?.slice(0, 10) || ''}" data-home="${match.home_entry_id}" data-away="${match.away_entry_id}"><div class="match-meta"><span>${escapeHtml(match.phase)} · Rodada ${match.round_number ?? '—'}</span><span>${escapeHtml(readableDate(match.scheduled_at))}</span><span class="pill">${escapeHtml(match.status)}</span></div><form data-match-id="${match.id}"><strong>${escapeHtml(names.get(match.home_entry_id) || 'Equipe indisponível')}</strong><input aria-label="Gols do mandante" name="home" type="number" min="0" max="32767" value="${match.home_score ?? ''}" required ${canEdit ? '' : 'disabled'}><b>×</b><input aria-label="Gols do visitante" name="away" type="number" min="0" max="32767" value="${match.away_score ?? ''}" required ${canEdit ? '' : 'disabled'}><strong>${escapeHtml(names.get(match.away_entry_id) || 'Equipe indisponível')}</strong><select name="status" aria-label="Situação do resultado" ${canEdit ? '' : 'disabled'}><option value="completed" ${match.status === 'completed' ? 'selected' : ''}>Finalizado</option><option value="confirmed" ${match.status === 'confirmed' ? 'selected' : ''}>Confirmado</option></select>${canEdit ? '<button class="primary-action" type="submit">Salvar</button>' : ''}</form><p role="status"></p></article>`).join('') : empty('Nenhuma partida cadastrada', 'Cadastre equipes e partidas para lançar resultados.')}</div>${canEdit ? `<div class="panel-card"><h2>Adicionar equipe existente</h2><form id="entry-form"><label>Clube<select name="club" id="club-select" required><option value="">Carregando clubes…</option></select></label><button class="secondary-action">Adicionar à temporada</button><p role="status"></p></form></div><div class="panel-card"><h2>Agendar partida</h2><form id="match-form" class="fixture-form"><label>Mandante<select name="home" required>${activeEntries.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.club_name_snapshot)}</option>`).join('')}</select></label><label>Visitante<select name="away" required>${activeEntries.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.club_name_snapshot)}</option>`).join('')}</select></label><label>Rodada<input name="round" type="number" min="1" required></label><label>Data e horário<input name="date" type="datetime-local"></label><button class="primary-action" ${activeEntries.length < 2 ? 'disabled' : ''}>Agendar</button><p role="status"></p></form></div>` : ''}`;
  panelMain().querySelector('#match-list')?.insertAdjacentHTML('beforebegin', `<div class="panel-card"><h2>${selected.draw_confirmed_at ? 'Sorteio oficial confirmado' : 'Montar estrutura'}</h2><p>${selected.draw_confirmed_at ? 'Grupos e confrontos foram gravados nesta temporada.' : `Use as ${activeEntries.length} equipes confirmadas desta ${selected.category ? 'categoria' : 'edição'} para sortear grupos, revisar confrontos e confirmar a gravação oficial.`}</p>${selected.draw_confirmed_at ? '' : `<a class="secondary-action" href="/planejador?temporada=${encodeURIComponent(selected.id)}">Abrir planejador com estas equipes →</a>`}</div>`);
  if (selected.draw_kind === 'corujao' && selected.draw_confirmed_at) {
    const progression = await ctx.client.rpc('corujao_advance_state', { target_season: selected.id });
    const state = progression.data as any;
    const fixturePreview = (state?.fixtures || []).map((fixture: any, index: number) =>
      `<li>Jogo ${index + 1}: <strong>${escapeHtml(names.get(fixture.homeId) || 'Equipe indisponível')}</strong> × <strong>${escapeHtml(names.get(fixture.awayId) || 'Equipe indisponível')}</strong></li>`).join('');
    const tiePreview = (state?.ties || []).map((tie: any, index: number) =>
      `<li><strong>${escapeHtml(tie.group)}</strong>: ${(tie.candidates || []).map((entryId: string) => escapeHtml(names.get(entryId) || 'Equipe indisponível')).join(', ')} ${canEdit ? `<button class="secondary-action" type="button" data-tie-index="${index}">Sortear desempate</button>` : ''}</li>`).join('');
    const championName = names.get(state?.championId) || 'Equipe indisponível';
    const progressionBody = progression.error
      ? `<p>Não foi possível consultar a progressão: ${escapeHtml(progression.error.code === 'PGRST202' ? 'a migration 202610270004 ainda não foi aplicada.' : progression.error.message)}</p>`
      : state?.status === 'awaiting_results'
        ? `<p>Confirme todas as partidas da ${state.phase === 'groups' ? 'fase de grupos' : state.phase === 'semifinal' ? 'semifinal' : 'final'} para avançar. ${state.confirmed || 0} de ${state.total || 0} resultados confirmados.</p>`
        : state?.status === 'tiebreak_required'
          ? `<p>Empate absoluto nos critérios do regulamento: pontos, vitórias, saldo e gols marcados. O sorteio oficial da posição deve ser registrado antes do avanço.</p><ul>${tiePreview}</ul>`
          : state?.status === 'ready'
            ? `<p>${state.phase === 'semifinal' ? 'Fase de grupos concluída. Revise os classificados e as semifinais.' : 'Semifinais concluídas. Revise o confronto da final.'}</p><ul>${fixturePreview}</ul>${canEdit ? '<button id="confirm-corujao-advance" class="primary-action" type="button">Gerar próxima fase</button>' : ''}`
            : state?.status === 'champion_ready'
              ? `<p>Final concluída. Campeão: <strong>${escapeHtml(championName)}</strong>.</p>${canEdit ? '<button id="confirm-corujao-advance" class="primary-action" type="button">Confirmar campeão</button>' : ''}`
              : state?.status === 'completed'
                ? `<p>Campeonato concluído. Campeão: <strong>${escapeHtml(championName)}</strong>.</p>`
                : `<p>${escapeHtml(state?.message || 'A progressão desta temporada ainda não está disponível.')}</p>`;
    panelMain().querySelector('#match-list')?.insertAdjacentHTML('beforebegin',
      `<section class="panel-card" id="corujao-progression" aria-labelledby="corujao-progression-title"><h2 id="corujao-progression-title">Caminho até o campeão</h2>${progressionBody}<p role="status" aria-live="polite"></p></section>`);
    const progressionPanel = panelMain().querySelector<HTMLElement>('#corujao-progression')!;
    progressionPanel.querySelectorAll<HTMLButtonElement>('[data-tie-index]').forEach((button) => button.addEventListener('click', async () => {
      if (!canEdit || !state || !window.confirm('Realizar e registrar o sorteio oficial deste desempate?')) return;
      const tie = state.ties[Number(button.dataset.tieIndex)];
      const message = progressionPanel.querySelector<HTMLElement>('[role="status"]')!;
      button.disabled = true; message.textContent = 'Registrando sorteio…';
      const result = await ctx.client.rpc('draw_corujao_tiebreak', {
        target_season: selected.id, target_group: tie.group, target_tie_key: tie.tieKey,
      });
      if (result.error) { message.textContent = result.error.message; button.disabled = false; }
      else { message.textContent = 'Sorteio registrado no histórico. Atualizando confrontos…'; location.reload(); }
    }));
    progressionPanel.querySelector<HTMLButtonElement>('#confirm-corujao-advance')?.addEventListener('click', async (event) => {
      if (!canEdit || !state?.revision || !window.confirm(state.status === 'champion_ready'
        ? 'Confirmar o campeão, o vice e concluir a temporada oficialmente?'
        : 'Confirmar e registrar estas partidas da próxima fase?')) return;
      const button = event.currentTarget as HTMLButtonElement;
      const message = progressionPanel.querySelector<HTMLElement>('[role="status"]')!;
      button.disabled = true; message.textContent = 'Registrando progressão oficial…';
      const result = await ctx.client.rpc('confirm_corujao_advance', {
        target_season: selected.id, expected_revision: state.revision,
      });
      if (result.error) { message.textContent = result.error.message; button.disabled = false; }
      else { message.textContent = 'Progressão registrada. Atualizando partidas…'; location.reload(); }
    });
  }
  if (selected.draw_confirmed_at) {
    panelMain().querySelector('#entry-form')?.closest('.panel-card')?.remove();
    panelMain().querySelector('#match-form')?.closest('.panel-card')?.remove();
  }
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
    row?.insertAdjacentHTML('beforeend', `<form class="penalty-form" data-penalty-id="${match.id}"><strong>Disputa por pênaltis</strong><label>${escapeHtml(names.get(match.home_entry_id) || 'Mandante')}<input name="home" type="number" min="0" max="32767" value="${penalty?.home_score ?? ''}" required ${canEdit ? '' : 'disabled'}></label><span>×</span><label>${escapeHtml(names.get(match.away_entry_id) || 'Visitante')}<input name="away" type="number" min="0" max="32767" value="${penalty?.away_score ?? ''}" required ${canEdit ? '' : 'disabled'}></label>${canEdit ? '<button class="secondary-action" type="submit">Salvar pênaltis</button>' : ''}<p role="status"></p></form>`);
  }
  panelMain().querySelectorAll<HTMLFormElement>('.match-row form[data-match-id]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canEdit) return;
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
    if (!canEdit) return;
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
  if (canEdit && !selected.draw_confirmed_at) {
    const entryPanel = panelMain().querySelector<HTMLFormElement>('#entry-form')?.closest('.panel-card');
    if (entryPanel) entryPanel.id = 'team-selection';
    if (entryPanel) entryPanel.innerHTML = `<h2>Selecionar equipes participantes</h2><p>Pesquise no banco permanente da sua organização. Cada equipe aparece uma única vez nesta ${selected.category ? 'categoria' : 'edição'}.</p><strong id="selected-count">${entries.filter((entry) => entry.status === 'confirmed').length} equipes selecionadas</strong><div id="selected-team-list" class="selected-team-list"></div><label>Buscar equipe<input id="club-search" type="search" placeholder="Ex.: Bon" autocomplete="off"></label><div id="club-search-results" class="team-select-results"></div><a class="secondary-action" href="/painel/equipes?retorno=${encodeURIComponent(`/painel/campeonatos/${id}/resultados?temporada=${selected.id}`)}">Cadastrar nova equipe</a><p id="entry-search-status" role="status"></p>`;
    const clubs = await ctx.client.from('clubs').select('id,official_name,crest_path,status').eq('organization_id', ctx.organization.id).order('official_name');
    fail(clubs.error);
    const allClubs = clubs.data || [];
    const crestUrls = await teamCrestUrls(ctx.client, allClubs);
    const selectedList = panelMain().querySelector<HTMLElement>('#selected-team-list');
    if (selectedList) selectedList.innerHTML = entries.filter((entry) => entry.status === 'confirmed').map((entry) => {
      return `<div class="selected-team">${teamShieldMarkup(crestUrls.get(entry.club_id), entry.club_name_snapshot, 'small')}<strong>${escapeHtml(entry.club_name_snapshot)}</strong><button type="button" data-remove-entry="${entry.id}" aria-label="Remover ${escapeHtml(entry.club_name_snapshot)}">Remover</button></div>`;
    }).join('');
    selectedList?.querySelectorAll<HTMLButtonElement>('[data-remove-entry]').forEach((button) => button.addEventListener('click', async () => {
      const entry = entries.find((item) => item.id === button.dataset.removeEntry);
      if (!entry || !window.confirm(`Remover ${entry.club_name_snapshot} desta ${selected.category ? 'categoria' : 'edição'}?`)) return;
      button.disabled = true;
      const result = await ctx.client.from('competition_entries').update({ status: 'withdrawn' }).eq('id', entry.id).eq('season_id', selected.id);
      if (result.error) { button.disabled = false; panelMain().querySelector<HTMLElement>('#entry-search-status')!.textContent = result.error.message; }
      else location.reload();
    }));
    const candidateTeams = allClubs.filter((club) => club.status !== 'archived' && !entries.some((entry) => entry.club_id === club.id && entry.status !== 'withdrawn'));
    const search = panelMain().querySelector<HTMLInputElement>('#club-search');
    const searchResults = panelMain().querySelector<HTMLElement>('#club-search-results');
    const renderCandidates = () => {
      if (!searchResults) return;
      const found = filterTeamDirectory(candidateTeams, search?.value || '');
      searchResults.innerHTML = found.length ? found.map((club) => `<button type="button" class="team-select-result" data-club-id="${club.id}">${teamShieldMarkup(crestUrls.get(club.id), club.official_name, 'small')}<span>${escapeHtml(club.official_name)}</span><small>${entries.some((entry) => entry.club_id === club.id) ? 'Reativar participação' : 'Adicionar'}</small></button>`).join('') : '<p class="data-note">Nenhuma equipe encontrada. Cadastre uma nova para continuar.</p>';
      searchResults.querySelectorAll<HTMLButtonElement>('.team-select-result').forEach((button) => button.addEventListener('click', async () => {
        const club = candidateTeams.find((item) => item.id === button.dataset.clubId); if (!club) return;
        button.disabled = true;
        const previous = entries.find((entry) => entry.club_id === club.id && entry.status === 'withdrawn');
        const entry = previous
          ? await ctx.client.from('competition_entries').update({ status: 'confirmed' }).eq('id', previous.id).eq('season_id', selected.id)
          : await ctx.client.from('competition_entries').insert({ season_id: selected.id, club_id: club.id, club_name_snapshot: club.official_name, crest_path_snapshot: club.crest_path, status: 'confirmed' });
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
  // Only the fixed in-memory demonstrations receive fictional arena art. Public
  // competitions continue to show their actual data without invented locations.
  const demoMatchNumber = /^(?:44444444|54444444)-4444-4444-8444-/.test(String(match.id))
    ? Number(String(match.id).slice(-12)) : 0;
  const demoSequence = Number.isInteger(demoMatchNumber) && demoMatchNumber >= 1 && demoMatchNumber <= 15
    ? String(demoMatchNumber) : '';
  const arenaClass = demoSequence ? ` demo-arena demo-arena--${demoSequence}` : '';
  const arenaData = demoSequence ? ` data-demo-arena="${demoSequence}"` : '';
  const footerOutcome = detail ? '' : outcome;
  return `<article class="public-fixture match-arena match-arena--${presentation}${detail ? ' match-detail-arena' : ''}${arenaClass}" data-match-id="${escapeHtml(match.id)}" data-fixture-status="${escapeHtml(match.status)}" data-round="${escapeHtml(match.round_number || 0)}"${arenaData}><div class="fixture-meta"><span>${escapeHtml(phases[match.phase] || match.phase)}${match.round_number ? ` · Rodada ${match.round_number}` : ''}</span><span class="fixture-status">${labels[match.status] || escapeHtml(match.status)}</span></div><div class="fixture-main">${team(home, 'Equipe indisponível')}<div class="fixture-score" aria-label="${hasResult ? `Placar ${match.home_score} a ${match.away_score}` : 'Sem placar'}">${score}</div>${team(away, 'Equipe indisponível')}</div>${date || footerOutcome ? `<div class="fixture-bottom">${date}${footerOutcome}</div>` : ''}${detailHref ? `<a class="fixture-detail-link" href="${escapeHtml(detailHref)}">Detalhes da partida <span aria-hidden="true">→</span></a>` : ''}</article>`;
}

function publicStandingTeam(row: any, entries: Map<string, any>, crests: Map<string, string>, leader = false, demo = false) {
  const entry = entries.get(row.id);
  const crest = entry?.crest_path_snapshot && crests.get(entry.crest_path_snapshot);
  const name = !demo && entry?.club_id && safeId(entry.club_id) ? `<a href="/clubes/${entry.club_id}">${escapeHtml(row.name)}</a>` : `<strong>${escapeHtml(row.name)}</strong>`;
  return `<span class="standing-team"><span class="standing-crest">${teamShieldMarkup(crest, row.name, 'large')}</span><span class="standing-team-label">${name}${leader ? '<span class="standing-leader-tag">LÍDER <span aria-hidden="true">♛</span></span>' : ''}</span></span>`;
}

export function publicStandingsView(standings: any[], entries: Map<string, any>, crests: Map<string, string>, matches: any[], detailHref: (id: string) => string, demo = false) {
  const hasLeader = standings.some((row) => row.played > 0);
  const performance = (row: any) => row.played ? `${Math.round(row.points / (row.played * 3) * 100)}%` : '—';
  const difference = (row: any) => `${row.goalsFor - row.goalsAgainst > 0 ? '+' : ''}${row.goalsFor - row.goalsAgainst}`;
  const chart = '<span class="standing-chart-icon" aria-hidden="true"><i></i><i></i><i></i></span>';
  const formFor = (row: any) => {
    const labels: Record<string, string> = { V: 'Vitória', E: 'Empate', D: 'Derrota' };
    const results = matches.filter((match) => match.status === 'confirmed' && ['league', 'groups'].includes(match.phase || 'league') && Number.isFinite(Number(match.home_score)) && Number.isFinite(Number(match.away_score)) && match.home_score !== null && match.away_score !== null && (match.home_entry_id === row.id || match.away_entry_id === row.id))
      .sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || '') || (a.round_number || 0) - (b.round_number || 0))
      .slice(-4)
      .map((match) => {
        const own = match.home_entry_id === row.id ? Number(match.home_score) : Number(match.away_score);
        const other = match.home_entry_id === row.id ? Number(match.away_score) : Number(match.home_score);
        return own > other ? 'V' : own < other ? 'D' : 'E';
      });
    return `<span class="recent-form" aria-label="Últimos quatro jogos, do mais antigo ao mais recente">${[...results, ...Array(4 - results.length).fill('')].map((result) => result ? `<span class="form-${result}" title="${labels[result]}" aria-label="${labels[result]}">${result}</span>` : '<span class="form-empty" aria-label="Partida ainda não disputada">–</span>').join('')}</span>`;
  };
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
  const expanded = (row: any) => `<div class="standing-expanded"><div class="standing-expanded-stats"><span><b>${row.played}</b> Jogos</span><span><b>${row.wins}</b> Vitórias</span><span><b>${row.draws}</b> Empates</span><span><b>${row.losses}</b> Derrotas</span><span><b>${row.goalsFor}</b> Gols marcados</span><span><b>${row.goalsAgainst}</b> Gols sofridos</span><span><b>${difference(row)}</b> Saldo de gols</span><span><b>${performance(row)}</b> Aproveitamento</span></div><div class="standing-expanded-bottom"><div><h3>Últimos resultados</h3>${formFor(row)}</div><div><h3>Histórico disponível</h3>${recentHistory(row) ? `<ul class="standing-history">${recentHistory(row)}</ul>` : '<p>Nenhuma partida confirmada.</p>'}</div></div></div>`;
  const rows = standings.map((row, index) => {
    const leader = index === 0 && hasLeader;
    const team = publicStandingTeam(row, entries, crests, leader, demo);
    return {
      desktop: `<tr class="standing-row standing-rank-${Math.min(index + 1, 4)}${leader ? ' standing-leader' : ''}"><td><span class="standing-position">${index + 1}</span></td><td><div class="standing-team-cell">${team}<button class="standing-expand" type="button" data-target="standing-detail-${index}" aria-expanded="false" aria-controls="standing-detail-${index}">${chart} Estatísticas e histórico</button></div></td><td class="standing-points"><strong>${row.points}</strong></td><td><span class="standing-value">${row.played}</span></td><td><span class="standing-value">${difference(row)}</span></td><td><div class="standing-form-cell">${formFor(row)}<button class="standing-chevron standing-expand" type="button" data-target="standing-detail-${index}" aria-label="Expandir estatísticas de ${escapeHtml(row.name)}" aria-expanded="false" aria-controls="standing-detail-${index}">›</button></div></td></tr><tr id="standing-detail-${index}" class="standing-desktop-expanded" hidden><td colspan="6">${expanded(row)}</td></tr>`,
      mobile: `<article class="standing-mobile-row standing-rank-${Math.min(index + 1, 4)}${leader ? ' standing-leader' : ''}"><span class="standing-mobile-position">${index + 1}</span>${team}<strong class="standing-points">${row.points}</strong><span class="standing-played">J <b>${row.played}</b></span><span class="standing-difference">SG <b>${difference(row)}</b></span><span class="standing-mobile-form">${formFor(row)}</span><details class="standing-mobile-details"><summary aria-label="Expandir estatísticas de ${escapeHtml(row.name)}">${chart} Estatísticas e histórico <span aria-hidden="true">⌄</span></summary>${expanded(row)}</details></article>`,
    };
  });
  return `<div class="standings-stage"><div class="standings-hero"><div class="standings-hero-copy"><span class="standings-kicker">TABELA DO <em>CAMPEONATO</em></span><h2>CLASSIFICAÇÃO</h2><p>ACOMPANHE O DESEMPENHO DAS EQUIPES</p></div><span class="standings-team-count"><svg viewBox="0 0 36 30" aria-hidden="true"><circle cx="18" cy="7" r="5"/><circle cx="6" cy="11" r="4"/><circle cx="30" cy="11" r="4"/><path d="M8 27v-5c0-5 4-9 10-9s10 4 10 9v5zM0 26v-5c0-4 3-7 7-7 2 0 3 0 4 1-3 2-5 6-5 10v1zM36 26v-5c0-4-3-7-7-7-2 0-3 0-4 1 3 2 5 6 5 10v1z"/></svg><b>${standings.length}</b> EQUIPES</span></div><div class="standings-scroll" role="region" aria-label="Classificação completa" tabindex="0"><table><thead><tr><th scope="col">#</th><th scope="col">Equipe</th><th scope="col">P</th><th scope="col">J</th><th scope="col">SG</th><th scope="col">Últimos jogos</th></tr></thead><tbody>${rows.map((row) => row.desktop).join('')}</tbody></table></div><div class="standings-mobile">${rows.map((row) => row.mobile).join('')}</div><p class="data-note standings-note"><span aria-hidden="true">ⓘ</span> Pontuação calculada das partidas confirmadas. Aproveitamento = pontos conquistados ÷ pontos possíveis.</p></div>`;
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
  const seasonsPromise = Promise.resolve(client.from('competition_seasons').select('*').eq('competition_id', id).order('created_at', { ascending: false }));
  let query = await client.from('competitions').select('id,name,sport,status,visibility,crest_path,subtitle,description,accent_color,regulation,prizes,location_mode,venue,starts_on,ends_on').eq('id', id).eq('visibility', 'public').maybeSingle();
  if (missingSchemaFeature(query.error)) query = await client.from('competitions').select('id,name,sport,status,visibility,subtitle,description,accent_color,regulation,prizes,location_mode,venue,starts_on,ends_on').eq('id', id).eq('visibility', 'public').maybeSingle();
  if (missingSchemaFeature(query.error)) query = await client.from('competitions').select('id,name,sport,status,visibility').eq('id', id).eq('visibility', 'public').maybeSingle();
  fail(query.error);
  const competition = query.data;
  if (!competition) { target.innerHTML = '<div class="public-shell"><a href="/campeonatos">← Campeonatos</a><h1>Campeonato não encontrado</h1><p>Ele pode não estar publicado.</p></div>'; return; }
  if (/^#[0-9A-Fa-f]{6}$/.test(competition.accent_color || '')) target.style.setProperty('--competition-accent', competition.accent_color);
  document.title = `${competition.name} | TR Campeonatos`;
  if (!new URLSearchParams(location.search).has('jogo')) {
    target.removeAttribute('role');
    target.innerHTML = `<header class="public-header"><a class="public-brand" href="/" aria-label="TR Campeonatos, início">${PUBLIC_BRAND}</a><nav aria-label="Navegação geral"><a href="/campeonatos">Campeonatos</a><a href="/demonstracao">Demonstração</a></nav></header><main class="public-shell"><div id="inicio" class="public-hero"><span class="public-hero-shield-placeholder" aria-hidden="true"></span><span>VITRINE PÚBLICA</span><h1>${escapeHtml(competition.name)}</h1><p>${escapeHtml(competition.sport)} · Carregando equipes</p><div class="public-share-actions" aria-hidden="true"><span class="secondary-action">Compartilhar campeonato</span><span class="secondary-action">Enviar no WhatsApp</span></div><p id="share-status" aria-hidden="true"></p></div><nav class="public-section-nav" aria-label="Seções da competição"><a href="#inicio">Início</a><a href="#classificacao">Classificação</a><a href="#jogos">Jogos</a><a href="#equipes">Equipes</a><a href="#estatisticas">Estatísticas</a></nav><div class="public-overview"><section class="panel-card public-featured" aria-label="Jogo em destaque"><div class="public-section-heading"><div><span>EM DESTAQUE</span><h2>Carregando partidas</h2></div></div><article class="public-fixture match-arena" aria-label="Carregando jogo"></article></section></div></main>`;
  }
  const [competitionCrestUrl, seasonsQuery] = await Promise.all([
    signedCompetitionShield(client, competition.crest_path),
    seasonsPromise,
  ]);
  fail(seasonsQuery.error);
  const seasons = seasonsQuery.data || [];
  const requested = new URLSearchParams(location.search).get('temporada');
  const season = seasons.find((item) => item.id === requested) || seasons[0];
  let entries: any[] = [], matches: any[] = [], titles: any[] = [], shootouts: any[] = [], tiebreakDraws: any[] = [];
  if (season) {
    const results = await Promise.all([
      client.from('competition_entries').select('*').eq('season_id', season.id),
      client.from('matches').select('id,phase,round_number,scheduled_at,home_entry_id,away_entry_id,home_score,away_score,status,updated_at').eq('season_id', season.id).order('scheduled_at', { ascending: true, nullsFirst: false }),
      client.from('competition_titles').select('id,place,club_id').eq('season_id', season.id),
    ]);
    results.forEach((result) => fail(result.error));
    entries = results[0].data || []; matches = results[1].data || []; titles = results[2].data || [];
    if (season.draw_kind === 'corujao' && matches.some((match) => match.phase === 'semifinal')) {
      const draws = await client.from('corujao_tiebreak_draws')
        .select('group_label,tie_key,ordered_ids,seed,drawn_at')
        .eq('season_id', season.id).order('drawn_at', { ascending: false });
      if (!draws.error) tiebreakDraws = draws.data || [];
    }
    const penaltiesPromise = matches.length
      ? Promise.resolve(client.from('penalty_shootouts').select('match_id,home_score,away_score,winning_entry_id').in('match_id', matches.map((match) => match.id)))
      : null;
    if (!demo) await refreshEntryCrests(client, entries);
    if (matches.length) {
      const penalties = await penaltiesPromise!;
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
  const lotteryOrder = new Map<string, number>();
  for (const draw of tiebreakDraws) for (const [position, entryId] of (draw.ordered_ids || []).entries()) {
    if (!lotteryOrder.has(entryId)) lotteryOrder.set(entryId, position);
  }
  standings.sort((a, b) => b.points - a.points || b.wins - a.wins || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor ||
    (entryById.get(a.id)?.group_label === entryById.get(b.id)?.group_label && lotteryOrder.has(a.id) && lotteryOrder.has(b.id)
      ? lotteryOrder.get(a.id)! - lotteryOrder.get(b.id)! : 0) || a.name.localeCompare(b.name));
  const titleNames = new Map(entries.map((entry) => [entry.club_id, entry.club_name_snapshot]));
  target.removeAttribute('role');
  const publicStatus = (value: string) => ({ active: 'Em andamento', draft: 'Rascunho', finished: 'Encerrado', completed: 'Concluído', published: 'Publicado', cancelled: 'Cancelado' } as Record<string, string>)[value] || value;
  const publicFormat = (value: string) => ({ round_robin: 'Pontos corridos', knockout: 'Mata-mata', groups_knockout: 'Grupos e mata-mata' } as Record<string, string>)[value] || value;
  const publicSeasonStatus = (item: any) => item.draw_confirmed_at && item.status === 'draft' ? 'Sorteio confirmado' : publicStatus(item.status);
  const publicGroupTitle = (label: string) => /^grupo\s+/i.test(label) ? label : `Grupo ${label}`;
  const routeBase = demo ? location.pathname : `/c/${id}`;
  const publicBase = `${routeBase}${season ? `?temporada=${encodeURIComponent(season.id)}` : ''}`;
  const detailHref = (matchId: string) => `${routeBase}?temporada=${encodeURIComponent(season.id)}&jogo=${encodeURIComponent(matchId)}`;
  const header = `<header class="public-header"><a class="public-brand" href="/" aria-label="TR Campeonatos, início">${PUBLIC_BRAND}</a><nav aria-label="Navegação geral"><a href="/campeonatos">Campeonatos</a><a href="/demonstracao">Demonstração</a></nav></header>`;
  const navBase = new URLSearchParams(location.search).has("jogo") ? publicBase : "";
  const mobileNav = `<nav class="public-mobile-nav" aria-label="Seções da competição"><a href="${navBase}#inicio"><span aria-hidden="true">⌂</span>Início</a><a href="${navBase}#classificacao"><span aria-hidden="true">♜</span>Classificação</a><a href="${navBase}#jogos"><span aria-hidden="true">▣</span>Jogos</a><a href="${navBase}#equipes"><span aria-hidden="true">♟</span>Equipes</a><a href="${navBase}#estatisticas"><span aria-hidden="true">▥</span>Estatísticas</a></nav>`;
  const requestedMatch = new URLSearchParams(location.search).get('jogo');
  const selectedMatch = requestedMatch && matches.find((match) => match.id === requestedMatch);
  if (requestedMatch) {
    const arenaNumber = demo && selectedMatch && /^(?:44444444|54444444)-4444-4444-8444-/.test(String(selectedMatch.id))
      ? Number(String(selectedMatch.id).slice(-12)) : 0;
    const arenaFile = arenaNumber >= 1 && arenaNumber <= 15 ? `${arenaNumber}.png` : '';
    const arenaLink = arenaFile ? `<p class="demo-arena-original"><a href="/assets/tr-stadiums/selected/${arenaFile}" target="_blank" rel="noopener noreferrer">Abrir imagem do estádio ↗</a></p>` : '';
    const shootout = selectedMatch ? shootoutByMatch.get(selectedMatch.id) : null;
    const eventsQuery = selectedMatch?.status === 'confirmed'
      ? await client.from('match_events').select('id,entry_id,event_type,minute,payload').eq('match_id', selectedMatch.id).order('minute', { ascending: true })
      : null;
    if (eventsQuery) fail(eventsQuery.error);
    const detail = selectedMatch ? `<div class="public-hero public-detail-hero"><span>DETALHES DA PARTIDA · ${escapeHtml(competition.name)}</span><h1>${escapeHtml((entryById.get(selectedMatch.home_entry_id)?.club_name_snapshot || 'Mandante') + ' × ' + (entryById.get(selectedMatch.away_entry_id)?.club_name_snapshot || 'Visitante'))}</h1>${selectedMatch.scheduled_at ? `<p>${escapeHtml(readableDate(selectedMatch.scheduled_at))}</p>` : ''}</div>${publicFixture(selectedMatch, entryById, crestUrls, shootout, undefined, true)}${arenaLink}${publicMatchDetailData(selectedMatch, shootout, eventsQuery?.data || [], entryById, matches)}` : `<section class="panel-card"><h1>Partida não encontrada</h1><p>Este confronto pode não estar disponível publicamente.</p></section>`;
    target.innerHTML = `${header}<main class="public-shell public-detail-page"><a class="back-link" href="${escapeHtml(publicBase)}#jogos">← Voltar aos jogos</a>${detail}</main>${mobileNav}`;
  } else {
    const confirmed = matches.filter((match) => match.status === 'confirmed' && match.home_score !== null && match.away_score !== null);
    const upcoming = matches.filter((match) => ['scheduled', 'in_progress'].includes(match.status));
    const featured = confirmed.at(-1) || matches.find((match) => match.status === 'completed') || upcoming[0];
    const rounds = [...new Set(matches.map((match) => match.round_number).filter(Boolean))].sort((a, b) => a - b);
    const resultCount = confirmed.length;
    const goals = confirmed.reduce((sum, match) => sum + match.home_score + match.away_score, 0);
    const teamCards = entries.filter((entry) => entry.status === 'confirmed').map((entry, index) => {
      const crest = entry.crest_path_snapshot && crestUrls.get(entry.crest_path_snapshot);
      const name = escapeHtml(entry.club_name_snapshot);
      const storedBackground = Number(entry.public_background_id);
      const backgroundId = Number.isInteger(storedBackground) && storedBackground >= 1 && storedBackground <= 20 ? storedBackground : demo && index < 6 ? index + 1 : 0;
      const backgroundStyle = backgroundId ? ` style="--team-card-image:url('/assets/team-backgrounds/${TEAM_BACKGROUND_FILES[backgroundId - 1]}.webp')"` : '';
      const content = `<span class="public-team-card-art">${teamShieldMarkup(crest, entry.club_name_snapshot, 'hero')}</span><span class="public-team-card-name"><strong>${name}</strong><small>CLUBE PARTICIPANTE</small></span>`;
      return !demo && entry.club_id && safeId(entry.club_id) ? `<a class="public-team-card"${backgroundStyle} href="/clubes/${entry.club_id}">${content}<span class="public-team-card-profile">Ver perfil →</span></a>` : `<div class="public-team-card"${backgroundStyle}>${content}</div>`;
    }).join('');
    const standingsTable = standingsSupported && (season?.format === "round_robin" || season?.format === "groups_knockout") && standings.length ? publicStandingsView(standings, entryById, crestUrls, matches, detailHref, demo) : "<p>A classificação por pontos ainda não está disponível para esta modalidade ou formato, ou não há equipes confirmadas.</p>";
    const completedMarkup = `${header}<main class="public-shell"><div id="inicio" class="public-hero"><span>${demo ? 'DEMONSTRAÇÃO · DADOS FICTÍCIOS' : 'VITRINE PÚBLICA'} · ${escapeHtml(season?.category || season?.label || competition.sport)}</span><h1>${escapeHtml(competition.name)}</h1><p>${escapeHtml(competition.sport)} · ${escapeHtml(publicStatus(competition.status))} · ${entries.length} equipes</p><div class="public-share-actions"><button id="share-competition" class="secondary-action" type="button">Compartilhar campeonato</button><a class="secondary-action" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(competition.name + ' — ' + location.origin + routeBase)}">Enviar no WhatsApp</a></div><p id="share-status" role="status"></p></div><nav class="public-section-nav" aria-label="Seções da competição"><a href="#inicio">Início</a><a href="#classificacao">Classificação</a><a href="#jogos">Jogos</a><a href="#equipes">Equipes</a><a href="#estatisticas">Estatísticas</a></nav>${season ? `<div class="season-bar"><label>${seasons.some((item) => item.category) ? 'Categoria' : 'Temporada'}<select id="public-season">${seasons.map((item) => `<option value="${item.id}" ${item.id === season.id ? 'selected' : ''}>${escapeHtml(item.category || item.label)}</option>`).join('')}</select></label><span>${escapeHtml(publicFormat(season.format))} · ${escapeHtml(publicSeasonStatus(season))}</span></div><div class="public-overview"><section class="panel-card public-featured" aria-label="Jogo em destaque"><div class="public-section-heading"><div><span>EM DESTAQUE</span><h2>${featured?.status === 'confirmed' ? 'Último resultado' : 'Próximo confronto'}</h2></div><a href="#jogos">Todos os jogos →</a></div>${featured ? publicFixture(featured, entryById, crestUrls, shootoutByMatch.get(featured.id), detailHref(featured.id)) : '<p>Nenhuma partida cadastrada nesta temporada.</p>'}</section><section class="panel-card public-upcoming"><div class="public-section-heading"><div><span>AGENDA</span><h2>Próximos jogos</h2></div></div>${upcoming.length ? upcoming.slice(0, 1).map((match) => publicFixture(match, entryById, crestUrls, shootoutByMatch.get(match.id), detailHref(match.id))).join('') + `<a class="upcoming-all" href="#jogos">Ver todos os confrontos →</a>` : '<p>Nenhum próximo jogo cadastrado.</p>'}</section></div><section class="panel-card public-section" id="jogos"><div class="public-section-heading"><div><span>CENTRAL DE PARTIDAS</span><h2>Jogos e resultados</h2></div><span>${matches.length} confrontos</span></div><div class="fixture-controls"><div role="group" aria-label="Filtrar partidas"><button type="button" class="fixture-filter active" data-filter="all" aria-pressed="true">Todas</button><button type="button" class="fixture-filter" data-filter="results" aria-pressed="false">Resultados</button><button type="button" class="fixture-filter" data-filter="upcoming" aria-pressed="false">Próximas</button></div><label>Rodada<select id="round-filter"><option value="all">Todas</option>${rounds.map((round) => `<option value="${round}">Rodada ${round}</option>`).join('')}</select></label></div><div class="public-fixtures">${matches.length ? matches.map((match) => publicFixture(match, entryById, crestUrls, shootoutByMatch.get(match.id), detailHref(match.id))).join('') : '<p>Nenhuma partida publicada nesta temporada.</p>'}</div><p id="fixture-empty" class="data-note" hidden>Nenhuma partida corresponde aos filtros.</p></section><section class="panel-card public-section" id="classificacao"><div class="public-section-heading"><div><span>TABELA DO CAMPEONATO</span><h2>Classificação</h2></div><span>${standings.length} equipes</span></div>${standingsTable}</section><section class="panel-card public-section premium-teams" id="equipes"><div class="premium-section-heading"><div class="premium-heading-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="8" r="5"/><path d="M6 27v-3a10 10 0 0 1 20 0v3zM2 24a7 7 0 0 1 5-7M30 24a7 7 0 0 0-5-7"/></svg></div><div><span>PARTICIPANTES</span><h2>EQUIPES</h2></div><span class="premium-heading-count"><strong>${entries.filter((entry) => entry.status === 'confirmed').length}</strong><span class="premium-count-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2M3 13a4 4 0 0 1 3-4m15 4a4 4 0 0 0-3-4"/></svg></span><small>EQUIPES INSCRITAS</small></span></div><div class="public-team-grid">${teamCards || '<p>Nenhuma equipe confirmada nesta temporada.</p>'}</div></section><section class="panel-card public-section premium-stats" id="estatisticas"><div class="premium-section-heading"><div class="premium-heading-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 27h24M7 24V9h5v15m4 0V5h5v19m4 0v-9h4v9"/></svg></div><div><span>DADOS DA TEMPORADA</span><h2>ESTATÍSTICAS</h2></div><div class="premium-season-slot"></div></div><div class="public-stats-grid"><div><span class="premium-stat-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M9 7h14v5a7 7 0 0 1-14 0V7zM9 9H4v3a6 6 0 0 0 6 6m13-9h5v3a6 6 0 0 1-6 6M16 19v6m-6 3h12m-9-3h6v3h-6z"/></svg></span><strong>${resultCount}</strong><span>Resultados confirmados</span><small>Partidas com placar final registrado</small></div><div><span class="premium-stat-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="m16 9 4 3-1.5 5h-5L12 12l4-3zm-4-1-4 1-3 5 3 3 4-1m8-5 4 2 1 5-4 1-3-3m-9 0-2 5 4 4 4-2v-5m5-3 4 2 2 5-4 3-4-2"/></svg></span><strong>${upcoming.length}</strong><span>Jogos por disputar</span><small>Partidas ainda não realizadas</small></div><div><span class="premium-stat-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M4 26V8h24v18M8 23V12h16v11M8 12l16 11m0-11L8 23M2 28h28"/></svg></span><strong>${goals}</strong><span>Gols confirmados</span><small>Total de gols na competição</small></div></div><p class="data-note"><span aria-hidden="true">ⓘ</span>${demo ? 'Os números são calculados dos placares desta demonstração. Estatísticas de atletas aparecem somente quando são cadastradas.' : 'Os números são calculados dos registros oficiais. Estatísticas de atletas aparecem somente após cadastro da súmula.'}</p></section><section class="panel-card public-section premium-champions"><div class="premium-section-heading"><div class="premium-heading-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M10 4h12v5a7 7 0 0 1-14 0V4zm0 2H4v3a7 7 0 0 0 7 7m11-10h6v3a7 7 0 0 1-7 7M16 16v7m-6 5h12m-9-5h6v5h-6"/></svg></div><div><span>HISTÓRIA DA COMPETIÇÃO</span><h2>CONQUISTAS CONFIRMADAS</h2></div></div>${titles.length ? `<div class="premium-champion-list">${titles.slice().sort((a, b) => a.place - b.place).map((title) => `<article class="premium-champion"><span class="premium-trophy" aria-hidden="true">🏆</span><div><strong>${title.place === 1 ? 'CAMPEÃO' : `${title.place}º LUGAR`}</strong><h3>${escapeHtml(titleNames.get(title.club_id) || 'Clube registrado')}</h3></div></article>`).join('')}</div>` : `<div class="premium-champion-empty"><span class="premium-trophy" aria-hidden="true">🏆</span><div><p>${demo ? 'Nenhum título registrado nesta demonstração.' : 'Nenhum título oficial confirmado para esta temporada.'}</p><small>Conquistas aparecerão aqui quando forem registradas.</small></div></div>`}</section>` : '<section class="panel-card"><h2>Nenhuma temporada publicada</h2><p>O organizador ainda não cadastrou uma temporada.</p></section>'}${demo ? '<a class="back-link" href="/demonstracao">← Voltar à demonstração interativa</a>' : '<a class="back-link" href="/campeonatos">← Ver outros campeonatos</a>'}</main>${season ? mobileNav : ''}`;
    const completed = document.createElement('div');
    completed.innerHTML = completedMarkup;
    const currentMain = target.querySelector<HTMLElement>('main.public-shell');
    const currentHero = currentMain?.querySelector<HTMLElement>('#inicio');
    const finishedMain = completed.querySelector<HTMLElement>('main.public-shell');
    const finishedHero = finishedMain?.querySelector<HTMLElement>('#inicio');
    if (currentMain && currentHero && finishedMain && finishedHero) {
      const currentTitle = currentHero.querySelector('h1');
      const finishedTitle = finishedHero.querySelector('h1');
      if (currentTitle && finishedTitle && currentTitle.textContent === finishedTitle.textContent) {
        const currentKicker = currentHero.querySelector(':scope > span:not(.public-hero-shield-placeholder)');
        const finishedKicker = finishedHero.querySelector('span');
        if (currentKicker && finishedKicker) currentKicker.textContent = finishedKicker.textContent;
        const currentSummary = currentHero.querySelector('p');
        const finishedSummary = finishedHero.querySelector('p');
        if (currentSummary && finishedSummary) currentSummary.textContent = finishedSummary.textContent;
        currentHero.querySelector('.public-share-actions')?.replaceWith(
          finishedHero.querySelector('.public-share-actions')!);
        currentHero.querySelector('#share-status')?.replaceWith(
          finishedHero.querySelector('#share-status')!);
      } else currentHero.innerHTML = finishedHero.innerHTML;
      finishedHero.remove();
      const currentNav = currentMain.querySelector<HTMLElement>('.public-section-nav');
      const finishedNav = finishedMain.querySelector<HTMLElement>('.public-section-nav');
      if (currentNav && finishedNav) { currentNav.innerHTML = finishedNav.innerHTML; finishedNav.remove(); }
      const currentOverview = currentMain.querySelector<HTMLElement>('.public-overview');
      const finishedOverview = finishedMain.querySelector<HTMLElement>('.public-overview');
      const finishedSeasonBar = finishedMain.querySelector<HTMLElement>('.season-bar');
      if (finishedSeasonBar && currentOverview) currentOverview.before(finishedSeasonBar);
      if (currentOverview && finishedOverview) {
        const currentFeatured = currentOverview.querySelector<HTMLElement>('.public-featured');
        const finishedFeatured = finishedOverview.querySelector<HTMLElement>('.public-featured');
        const currentFixture = currentFeatured?.querySelector<HTMLElement>('.public-fixture');
        const finishedFixture = finishedFeatured?.querySelector<HTMLElement>('.public-fixture');
        if (currentFeatured && finishedFeatured && currentFixture && finishedFixture) {
          currentFixture.className = finishedFixture.className;
          currentFixture.removeAttribute('aria-label');
          for (const attribute of Array.from(finishedFixture.attributes)) currentFixture.setAttribute(attribute.name, attribute.value);
          currentFixture.replaceChildren(...Array.from(finishedFixture.childNodes));
          currentFeatured.querySelector('.public-section-heading')?.remove();
          const finishedHeading = finishedFeatured.querySelector('.public-section-heading');
          if (finishedHeading) currentFeatured.prepend(finishedHeading);
          finishedFeatured.remove();
        } else if (currentFeatured && finishedFeatured) currentFeatured.replaceWith(finishedFeatured);
        currentOverview.append(...Array.from(finishedOverview.childNodes));
        finishedOverview.remove();
      }
      currentMain.append(...Array.from(finishedMain.childNodes));
      const mobile = completed.querySelector<HTMLElement>('.public-mobile-nav');
      if (mobile) target.append(mobile);
    } else {
      target.innerHTML = completedMarkup;
    }
    const seasonBar = target.querySelector<HTMLElement>('.season-bar');
    const seasonSlot = target.querySelector<HTMLElement>('.premium-season-slot');
    if (seasonBar && seasonSlot) seasonSlot.append(seasonBar);
    if (!demo) {
      if (competition.subtitle) target.querySelector('#inicio h1')?.insertAdjacentHTML('afterend', `<p class="public-subtitle">${escapeHtml(competition.subtitle)}</p>`);
      const details = [
        competition.description ? `<div><h3>Sobre o campeonato</h3><p>${escapeHtml(competition.description)}</p></div>` : '',
        competition.location_mode === 'presential' && competition.venue ? `<div><h3>Local</h3><p>${escapeHtml(competition.venue)}</p></div>` : '',
        competition.starts_on || competition.ends_on ? `<div><h3>Período</h3><p>${escapeHtml(competition.starts_on || 'Data inicial a definir')}${competition.ends_on ? ` a ${escapeHtml(competition.ends_on)}` : ''}</p></div>` : '',
        competition.regulation ? `<div><h3>Regulamento</h3><p>${escapeHtml(competition.regulation)}</p></div>` : '',
        competition.prizes ? `<div><h3>Premiações</h3><p>${escapeHtml(competition.prizes)}</p></div>` : '',
      ].filter(Boolean).join('');
      if (details) target.querySelector('#estatisticas')?.insertAdjacentHTML('afterend', `<section class="panel-card public-section public-competition-details"><h2>Informações do campeonato</h2>${details}</section>`);
    }
    const groupedEntries = new Map<string, any[]>();
    for (const entry of entries.filter((item) => item.status === 'confirmed' && typeof item.group_label === 'string' && item.group_label.trim())) {
      const label = entry.group_label.trim();
      groupedEntries.set(label, [...(groupedEntries.get(label) || []), entry]);
    }
    if (groupedEntries.size) {
      const groupCards = [...groupedEntries].map(([label, groupEntries]) => `<article class="public-group-card"><span>${escapeHtml(publicGroupTitle(label).toLocaleUpperCase('pt-BR'))}</span><strong>${groupEntries.length} equipes</strong><ul>${groupEntries.map((entry) => {
        const crest = entry.crest_path_snapshot && crestUrls.get(entry.crest_path_snapshot);
        return `<li>${teamShieldMarkup(crest, entry.club_name_snapshot, 'small')}<span>${escapeHtml(entry.club_name_snapshot)}</span></li>`;
      }).join('')}</ul></article>`).join('');
      target.querySelector('#jogos')?.insertAdjacentHTML('beforebegin', `<section class="panel-card public-section" id="grupos"><div class="public-section-heading"><div><span>PRIMEIRA FASE</span><h2>Grupos</h2></div><span>${groupedEntries.size} grupos</span></div><div class="public-groups-grid">${groupCards}</div></section>`);
      const groupStandings = [...groupedEntries].map(([label, groupEntries]) => {
        const ids = new Set(groupEntries.map((entry) => entry.id));
        const rows = standings.filter((row) => ids.has(row.id));
        return `<div class="public-group-standings"><h3>${escapeHtml(publicGroupTitle(label))}</h3>${publicStandingsView(rows, entryById, crestUrls, matches.filter((match) => match.phase === 'groups' && ids.has(match.home_entry_id) && ids.has(match.away_entry_id)), detailHref, demo)}</div>`;
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
    target.querySelector('#jogos .fixture-controls [role="group"]')?.insertAdjacentHTML('beforeend', '<button type="button" class="fixture-filter" data-filter="rounds" aria-pressed="false">☷ &nbsp;Por Rodada</button>');
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
      if (button.dataset.filter === 'rounds') {
        activeFilter = 'all';
        const roundSelect = target.querySelector<HTMLSelectElement>('#round-filter');
        if (roundSelect) { roundSelect.value = String(rounds[0] || 'all'); roundSelect.focus(); }
      } else {
        activeFilter = button.dataset.filter || 'all';
        const roundSelect = target.querySelector<HTMLSelectElement>('#round-filter');
        if (roundSelect) roundSelect.value = 'all';
      }
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
    target.querySelectorAll<HTMLButtonElement>(`.standing-expand[data-target="${button.dataset.target}"]`).forEach((control) => control.setAttribute('aria-expanded', String(!detail.hidden)));
  }));
  const shieldPlaceholder = target.querySelector('.public-hero-shield-placeholder');
  if (shieldPlaceholder) shieldPlaceholder.outerHTML = competitionShieldMarkup(competitionCrestUrl, competition.name, 'public-hero-shield');
  else target.querySelector('.public-hero')?.insertAdjacentHTML('afterbegin', competitionShieldMarkup(competitionCrestUrl, competition.name, 'public-hero-shield'));
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
    client.from('competition_entries').select('id,season_id,final_position,final_phase,season:competition_seasons(id,label,category,competition:competitions(id,name,sport,visibility))').eq('club_id', id).order('registered_at', { ascending: false }),
    client.from('competition_titles').select('id,place,confirmed_at,season:competition_seasons(id,label,category,competition:competitions(id,name,sport,visibility))').eq('club_id', id).order('confirmed_at', { ascending: false }),
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
  target.innerHTML = `<header class="public-header"><a href="/" aria-label="TR Campeonatos, início">${PUBLIC_BRAND}</a><nav><a href="/campeonatos">Campeonatos</a><a href="/demonstracao">Demonstração</a></nav></header><main class="public-shell"><div class="public-hero club-hero"><span class="club-crest">${teamShieldMarkup(crestUrl, club.official_name, 'hero', 'eager')}</span><div><span>PERFIL OFICIAL DO CLUBE</span><h1>${escapeHtml(club.official_name)}</h1><p>${escapeHtml(club.sport)} · Identidade permanente</p></div></div>${historySummary}<div class="public-grid"><section class="panel-card"><h2>Participações públicas</h2>${entries.length ? entries.map((entry: any) => `<article class="history-row"><strong><a href="/c/${entry.season.competition.id}">${escapeHtml(entry.season.competition.name)}</a></strong><span>${escapeHtml(entry.season.category || entry.season.label)} · ${entry.final_position ? `${entry.final_position}º lugar` : entry.final_phase ? escapeHtml(entry.final_phase) : 'Participação registrada'}</span></article>`).join('') : '<p>Nenhuma participação pública registrada.</p>'}</section><section class="panel-card"><h2>Conquistas confirmadas</h2>${titles.length ? titles.map((title: any) => `<article class="history-row"><strong>${title.place === 1 ? 'Campeão' : title.place === 2 ? 'Vice-campeão' : 'Terceiro lugar'}</strong><span>${escapeHtml(title.season.competition.name)} · ${escapeHtml(title.season.category || title.season.label)}</span></article>`).join('') : '<p>Nenhum título oficial confirmado.</p>'}</section></div><section class="panel-card"><h2>Resultados recentes</h2>${recentMatches || '<p>Nenhuma partida confirmada em competições públicas.</p>'}</section><a class="back-link" href="/campeonatos">← Ver campeonatos</a></main>`;
}

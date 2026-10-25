import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve('supabase/migrations/202610230002_organizer_authorization.sql'), 'utf8');
const app = readFileSync(resolve('src/real-app.ts'), 'utf8');
const server = readFileSync(resolve('server.mjs'), 'utf8');

test('autorização de organizador é aplicada no banco e não pode ser promovida pelo próprio usuário', () => {
  assert.match(migration, /account_role text not null default 'visitor'/);
  assert.match(migration, /organizer_status text not null default 'pending'/);
  assert.match(migration, /create or replace function public\.is_approved_organizer\(\)/);
  assert.match(migration, /create or replace function public\.is_platform_administrator\(\)/);
  assert.match(migration, /create trigger profiles_authorization_guard/);
  assert.match(migration, /Only a platform administrator can change organizer authorization/);
  assert.match(migration, /drop policy if exists profiles_self/);
  assert.match(migration, /create policy organizations_create[\s\S]*public\.is_approved_organizer\(\)/);
  assert.match(migration, /create policy clubs_create[\s\S]*public\.is_approved_organizer\(\)/);
  assert.match(migration, /create or replace function public\.review_organizer\(target_user uuid, next_status text\)/);
  assert.match(migration, /revoke all on function public\.review_organizer\(uuid, text\) from public/);
});

test('painel verifica sessão e aprovação antes de consultar ou criar organizações', () => {
  const panel = app.slice(app.indexOf('async function panelPage'), app.indexOf('const panelMain'));
  assert.match(panel, /client\.auth\.getUser\(\)/);
  assert.match(panel, /from\('profiles'\)\.select\('\*'\)/);
  assert.match(panel, /if \(!approvedOrganizer\(profile\)\) return restrictedPanel/);
  assert.ok(panel.indexOf('!approvedOrganizer(profile)') < panel.indexOf("from('organization_members')"));
  assert.ok(panel.indexOf('!approvedOrganizer(profile)') < panel.indexOf('organizationSetup'));
  assert.match(app, /installPasswordVisibilityToggle/);
  assert.match(app, /client\.auth\.signInWithPassword/);
  assert.match(app, /client\.auth\.resetPasswordForEmail/);
});

test('aliases administrativos seguem para a rota protegida', () => {
  assert.match(server, /\['\/dashboard', '\/organizador', '\/admin'\]\.includes\(pathname\)/);
  assert.match(server, /Location: '\/painel'/);
});

test('links públicos do painel abrem em outra aba e a cópia usa o campeonato atual', () => {
  assert.match(app, /href="\/campeonatos" target="_blank" rel="noopener noreferrer">Vitrine pública/);
  assert.match(app, /href="\/c\/\$\{id\}" target="_blank" rel="noopener noreferrer">Abrir página pública/);
  assert.match(app, /id="copy-public-link"/);
  assert.match(app, /navigator\.clipboard\.writeText\(publicUrl\)/);
});

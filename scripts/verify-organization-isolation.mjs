import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.TR_SUPABASE_URL;
const key = process.env.TR_SUPABASE_ANON_KEY;
const seasonId = process.env.TR_TEST_SEASON_ID;
const competitionId = process.env.TR_TEST_COMPETITION_ID;
const matchId = process.env.TR_TEST_MATCH_ID;
for (const [name, value] of Object.entries({
  TR_SUPABASE_URL: url, TR_SUPABASE_ANON_KEY: key,
  TR_TEST_SEASON_ID: seasonId, TR_TEST_COMPETITION_ID: competitionId,
  TR_TEST_MATCH_ID: matchId,
})) if (!value) throw new Error(`Defina ${name} antes do teste.`);

const roles = ['OWNER', 'EDITOR', 'VIEWER', 'OUTSIDER'];
const clients = new Map();
for (const role of roles) {
  const email = process.env[`TR_TEST_${role}_EMAIL`];
  const password = process.env[`TR_TEST_${role}_PASSWORD`];
  if (!email || !password) throw new Error(`Defina o e-mail e a senha locais de ${role}; não os envie pelo chat.`);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.user) throw new Error(`Falha no login de ${role}: ${login.error?.message}`);
  clients.set(role, client);
}
const owner = clients.get('OWNER');
const competition = async () => {
  const result = await owner.from('competitions').select('id,visibility')
    .eq('id', competitionId).single();
  if (result.error) throw result.error;
  return result.data;
};
const matches = async () => {
  const result = await owner.from('matches')
    .select('id,phase,home_score,away_score,status')
    .eq('season_id', seasonId).order('id');
  if (result.error) throw result.error;
  return result.data;
};
const baselineCompetition = await competition();
assert.equal(baselineCompetition.visibility, 'private',
  'O teste precisa usar campeonato privado.');
const baselineMatches = await matches();
const target = baselineMatches.find((match) => match.id === matchId);
if (!target) throw new Error('A partida de teste não pertence à temporada.');
if (target.home_score === null || target.away_score === null || target.status !== 'confirmed')
  throw new Error('Escolha uma partida já confirmada da fase atual para o teste de permissão.');
const ownerState = await owner.rpc('corujao_advance_state', {
  target_season: seasonId,
});
if (ownerState.error || !ownerState.data?.status)
  throw new Error('A conta proprietária não conseguiu consultar o estado da temporada privada.');
const editorState = await clients.get('EDITOR').rpc('corujao_advance_state', {
  target_season: seasonId,
});
assert.equal(editorState.error, null, 'Editor deve consultar a progressão.');
const viewerState = await clients.get('VIEWER').rpc('corujao_advance_state', {
  target_season: seasonId,
});
assert.equal(viewerState.error, null, 'Leitor deve consultar sua organização.');
const outsiderRead = await clients.get('OUTSIDER').from('competitions')
  .select('id').eq('id', competitionId);
assert.equal(outsiderRead.error, null);
assert.deepEqual(outsiderRead.data, [], 'Outra organização não deve ler o campeonato privado.');
const outsiderState = await clients.get('OUTSIDER').rpc('corujao_advance_state', {
  target_season: seasonId,
});
assert.ok(outsiderState.error, 'Outra organização não deve consultar a progressão.');

for (const role of ['OWNER', 'EDITOR']) {
  const allowed = await clients.get(role).rpc('set_competition_publication', {
    target_competition: competitionId, make_public: false,
  });
  assert.equal(allowed.error, null, `${role} deve poder administrar a competição privada.`);
  assert.equal(allowed.data?.visibility, 'private', `${role} deve manter a competição privada.`);
}

const denied = [];
for (const role of ['VIEWER', 'OUTSIDER']) {
  const client = clients.get(role);
  const advance = await client.rpc('confirm_corujao_advance', {
    target_season: seasonId, expected_revision: 'security-test-stale-revision',
  });
  assert.ok(advance.error && /Not authorized/i.test(advance.error.message),
    `${role} não pode avançar a fase.`);
  const result = await client.rpc('set_match_result', {
    target_match: matchId,
    target_home_score: target.home_score,
    target_away_score: target.away_score,
    target_status: target.status,
  });
  if (!result.error) {
    throw new Error(`${role} conseguiu gravar a partida de teste; confira o histórico de auditoria.`);
  }
  assert.ok(result.error && /Not authorized|permission denied/i.test(result.error.message),
    `${role} não pode editar o placar.`);
  const publication = await client.rpc('set_competition_publication', {
    target_competition: competitionId, make_public: false,
  });
  if (!publication.error) {
    throw new Error(`${role} conseguiu alterar a visibilidade da competição de teste; confira o histórico de auditoria.`);
  }
  assert.ok(publication.error && /Not authorized|permission denied/i.test(publication.error.message),
    `${role} não pode publicar o campeonato.`);
  denied.push(role);
  assert.deepEqual(await matches(), baselineMatches,
    `${role} não pode alterar partidas.`);
  assert.deepEqual(await competition(), baselineCompetition,
    `${role} não pode alterar publicação.`);
}
console.log(JSON.stringify({
  project: new URL(url).host,
  privateRead: { owner: true, editor: true, viewer: true, outsider: false },
  allowedWrites: ['OWNER', 'EDITOR'],
  deniedWrites: denied,
  matchUnchanged: true,
  publicationUnchanged: true,
}));

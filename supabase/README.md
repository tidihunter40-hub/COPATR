# Supabase: modo real da TR Campeonatos

O laboratório continua local e fictício. A pasta `migrations/` define o banco do modo real, que preserva clubes, participações, resultados confirmados e títulos após o encerramento de uma temporada.

> As migrations `202610230003_authorization_and_publication.sql` e `202610250004_tr_smart_shield.sql` ainda precisam ser revisadas e aplicadas no ambiente Supabase de destino. O painel atualizado depende das funções `create_competition_with_season`, `set_competition_publication` e `set_penalty_shootout`; sem essas migrations, ações oficiais podem retornar erro. Consulte [o estado da implementação](../docs/implementacao-painel-portal-2026-10-23.md) antes de liberar o modo oficial.

## Configuração

1. Crie um projeto no Supabase e habilite e-mail/senha em Authentication.
2. Vincule o repositório ao projeto com a CLI do Supabase e aplique a migration:

   ```powershell
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```

3. Execute a aplicação com as variáveis abaixo. A chave publicável pode ir ao navegador; chaves `sb_secret_` e qualquer chave administrativa ficam exclusivamente no servidor.

   ```powershell
   $env:TR_SUPABASE_URL = 'https://SEU_PROJECT_REF.supabase.co'
   $env:TR_SUPABASE_ANON_KEY = 'SUA_CHAVE_ANON'
   $env:TR_PUBLIC_BASE_URL = 'https://SEU_DOMINIO_OFICIAL'
   npm start
   ```

4. Crie uma conta de teste no Supabase Auth. O gatilho `auth_user_profile` cria o perfil público correspondente.

Quando as duas variáveis estão ausentes, a interface mantém o aviso “Modo demonstração local” e não faz chamadas ao Supabase.

## Modelo e integridade

- `clubs` é a identidade permanente. O UUID nunca depende de nome ou escudo.
- `competition_entries` é a participação em uma temporada e mantém snapshots do nome, sigla e escudo usados naquele período.
- `matches` conta para histórico somente com `status = 'confirmed'`.
- `competition_titles` só aceita uma colocação por temporada e entrada; a função `confirm_competition_title` exige temporada concluída e administrador da organização.
- `set_match_result` registra revisões e exige editor da organização. Disputas de pênaltis ficam em `penalty_shootouts`, portanto não entram nos gols regulamentares.
- Os gatilhos validam que participantes de partidas, pênaltis e títulos pertencem à mesma temporada.
- `club_lifetime_stats`, `club_season_stats` e `club_ranking_by_sport` derivam números e rankings de partidas confirmadas. A tela deve filtrar por modalidade, temporada e competição antes de comparar clubes.

## Autorização

As tabelas usam RLS. Pessoas ligadas a uma organização podem administrar somente suas competições; responsáveis do clube administram somente sua identidade. Clubes e competições públicos têm leitura pública, mas isso não cria direito de edição.

O bucket privado `club-crests` aceita PNG, JPG, JPEG e WEBP até 3 MB. A pasta de cada objeto começa com o UUID do clube, e as políticas conferem a associação do usuário ao clube. Use `getSignedCrestUrl` para mostrar um escudo privado.

## TR Smart Shield

Ao cadastrar um escudo, o navegador verifica a assinatura real do arquivo, limita as dimensões a 4096 px e preserva o upload original. Em seguida, cria um PNG transparente de 512 px somente quando já há transparência ou quando o fundo é conectado à borda, dominante e de baixa variação. Não há regra especial para branco ou preto. Em imagem complexa, pequena ou ambígua, o sistema mantém o original e registra `original_fallback`; não inventa um recorte.

Depois de aplicar `202610250004_tr_smart_shield.sql`, `clubs` guarda `crest_original_path`, `crest_processed_path`, status e metadados, enquanto `club_crest_jobs` fornece a trilha de auditoria. O `crest_path` corrente passa a apontar para o derivado seguro quando ele existe. `competition_entries.crest_path_snapshot` não é reescrito: temporadas concluídas preservam a identidade que já registraram. Para reprocessar escudos antigos, reenvie o original por uma sessão autenticada de editor; não use uma chave administrativa no navegador.

## Serviço no navegador

`dist/supabase-real-mode.mjs` usa somente a URL e a chave publicável de `TR_SUPABASE_URL` e `TR_SUPABASE_ANON_KEY`. Ele expõe login, clube permanente, upload de escudo, histórico público, resultado oficial e confirmação de título. O arquivo não possui nem aceita chaves secretas.

Antes de conectar telas reais, valide o projeto com uma conta de cada papel: proprietário de clube, editor de organização, visualizador e usuário sem vínculo. Não importe automaticamente dados do laboratório: uma competição real deve nascer com autenticação e vínculos explícitos.

## Interface local atual

`/entrar` usa Supabase Auth para entrar, criar conta e recuperar senha. `/painel` e as rotas sob `/painel/campeonatos` exigem sessão; as ações oficiais passam pela RLS do banco. `/c/{uuid}` publica somente competições com `visibility = 'public'`, e `/clubes/{uuid}` mostra participações e títulos públicos de clubes ativos. O laboratório permanece separado em `/demonstracao`.

O formulário de resultado chama `set_match_result`; status, horário e pênaltis ainda precisam de um fluxo administrativo completo. A criação de jogadores depende de um modelo novo, inexistente nesta migration. Antes de usar o painel com dados oficiais, execute os testes com contas de diferentes papéis descritos acima.

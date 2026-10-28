# Supabase: modo real da TR Campeonatos

O laboratório continua local e fictício. A pasta `migrations/` define o banco do modo real, que preserva clubes, participações, resultados confirmados e títulos após o encerramento de uma temporada.

> A migration `202610250005_team_directory_and_access.sql` precisa ser aplicada depois da `202610250004_tr_smart_shield.sql`. Ela vincula o catálogo administrativo de equipes à organização, impede participações entre assinantes e preserva todos os registros anteriores. Consulte [o estado da implementação](../docs/implementacao-painel-portal-2026-10-23.md) antes de liberar o modo oficial.

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

### Acesso por convite

A interface não chama `auth.signUp` e não mostra cadastro público: o visitante só pode entrar ou solicitar acesso pelo WhatsApp. Para impedir também solicitações diretas ao endpoint de Auth, desative **Allow new users to sign up** nas configurações de Authentication do projeto Supabase. Depois, crie cada credencial manualmente no painel do Supabase e use `review_organizer` com uma conta `platform_admin` para aprovar o organizador. A proteção do painel continua validada por sessão, perfil aprovado e RLS; ela não depende de botão oculto no navegador.

## Modelo e integridade

- `clubs` é a identidade permanente. O UUID nunca depende de nome ou escudo.
- `competition_entries` é a participação em uma temporada e mantém snapshots do nome, sigla e escudo usados naquele período.
- `matches` conta para histórico somente com `status = 'confirmed'`.
- `competition_titles` só aceita uma colocação por temporada e entrada; a função `confirm_competition_title` exige temporada concluída e administrador da organização.
- `set_match_result` registra revisões e exige editor da organização. Disputas de pênaltis ficam em `penalty_shootouts`, portanto não entram nos gols regulamentares.
- Os gatilhos validam que participantes de partidas, pênaltis e títulos pertencem à mesma temporada.
- `club_lifetime_stats`, `club_season_stats` e `club_ranking_by_sport` derivam números e rankings de partidas confirmadas. A tela deve filtrar por modalidade, temporada e competição antes de comparar clubes.

## Progressão do Corujão de oito equipes

A migration `202610270004_corujao_eight_progression.sql` depende de `202610250007_official_draw.sql`, `202610250006_competition_setup_and_archive.sql`, `202610230003_authorization_and_publication.sql` e `202610270003_restrict_anonymous_mutations.sql`. Ela não modifica os resultados ou campeonatos existentes. Só habilita a progressão oficial de uma temporada com oito equipes distribuídas em dois grupos de quatro e com os 12 jogos iniciais confirmados. Os outros tamanhos mantêm o sorteio existente, mas a progressão exige regulamento específico.

O organizador vê a prévia e confirma cada avanço. As semifinais cruzam A1 × B2 e B1 × A2; seus vencedores disputam a final. Um placar empatado no mata-mata exige disputa de pênaltis registrada. Após a final, a confirmação registra campeão e vice, conclui a temporada e publica os títulos. Alterações de placar, pênaltis, confrontos e posições de uma fase consolidada são bloqueadas; uma correção posterior exige revisão administrativa específica.

Se pontos, vitórias, saldo e gols marcados não distinguirem equipes em posições que afetam a classificação, o organizador precisa confirmar um sorteio de desempate. A função `draw_corujao_tiebreak` grava os candidatos, a semente aleatória, a ordem sorteada, o autor e a assinatura dos resultados. Mudanças nos resultados antes do avanço invalidam a decisão antiga; o histórico permanece auditável. As três funções de progressão permitem execução somente a contas autenticadas, e cada uma verifica a organização e o papel apropriado.

Antes de aplicar a migration no projeto em uso, execute `VERIFY_20261027_RELEASE_READ_ONLY.sql` e `VERIFY_202610270004_READ_ONLY.sql`, preserve um backup do banco e confira o plano de recuperação em `docs/plano-corujao-progressao-2026-10-27.md`. Não use `supabase db push` indiscriminadamente em produção com outras migrations pendentes. O teste SQL isolado roda com `node --test tests/corujao-progression.test.mjs`.

## Autorização

As tabelas usam RLS. Pessoas ligadas a uma organização podem administrar somente suas competições; responsáveis do clube administram somente sua identidade. Clubes e competições públicos têm leitura pública, mas isso não cria direito de edição.

Um único projeto Supabase pode atender várias organizações e administradores. O teste de isolamento exige contas distintas no mesmo projeto, cada uma com seu JWT e vínculo próprio; criar outro projeto não é requisito funcional. Para executar a prova negativa com um campeonato privado de QA, configure as credenciais locais e os IDs de teste exigidos por `scripts/verify-organization-isolation.mjs`. Não inclua senhas no repositório.

O bucket privado `club-crests` aceita PNG, JPG, JPEG e WEBP até 3 MB. A pasta de cada objeto começa com o UUID do clube, e as políticas conferem a associação do usuário ao clube. Use `getSignedCrestUrl` para mostrar um escudo privado.

## TR Smart Shield

Ao cadastrar um escudo, o navegador verifica a assinatura real do arquivo, limita as dimensões a 4096 px e preserva o upload original. Em seguida, cria um PNG transparente de 512 px somente quando já há transparência ou quando o fundo é conectado à borda, dominante e de baixa variação. Não há regra especial para branco ou preto. Em imagem complexa, pequena ou ambígua, o sistema mantém o original e registra `original_fallback`; não inventa um recorte.

Depois de aplicar `202610250004_tr_smart_shield.sql`, `clubs` guarda `crest_original_path`, `crest_processed_path`, status e metadados, enquanto `club_crest_jobs` fornece a trilha de auditoria. O `crest_path` corrente passa a apontar para o derivado seguro quando ele existe. `competition_entries.crest_path_snapshot` não é reescrito: temporadas concluídas preservam a identidade que já registraram. Para reprocessar escudos antigos, reenvie o original por uma sessão autenticada de editor; não use uma chave administrativa no navegador.

## Escudos dos campeonatos

Depois de aplicar `202610260001_competition_crests.sql`, o painel aceita PNG e JPEG de até 3 MB no cadastro e em **Editar informações**. O navegador confere a assinatura do arquivo, prepara uma prévia do recorte e permite escolher o original. O bucket privado `competition-crests` limita MIME e tamanho no servidor; as políticas verificam o UUID da organização e do campeonato no caminho do objeto. Campeonatos públicos podem exibir o escudo por URL assinada. Quando não há escudo personalizado, a interface usa o escudo padrão TR, sem alterar a logomarca institucional nem o escudo dos clubes.

Para conferir as colunas no projeto configurado sem gravar dados, execute `node --use-system-ca scripts/verify-competition-crest-readonly.mjs` na raiz do repositório.

## Diretório de equipes

Depois de aplicar `202610250005_team_directory_and_access.sql`, `/painel/equipes` é o cadastro permanente e privado da organização. O formulário exige apenas nome e escudo; a modalidade usada por registros legados deixa de filtrar o catálogo, pois a participação é vinculada à modalidade do campeonato. A seleção de participantes pesquisa por nome sem diferenciar caixa ou acentuação, não oferece equipes arquivadas e a restrição `unique (season_id, club_id)` continua impedindo duplicidade.

Uma equipe pode ser arquivada, nunca é apagada pelo painel. O histórico administrativo é derivado de participações, placares confirmados e títulos registrados, portanto correções oficiais são refletidas sem inventar estatísticas. A nova migration também bloqueia, no banco, a entrada de uma equipe em competição de outra organização.

## Serviço no navegador

`dist/supabase-real-mode.mjs` usa somente a URL e a chave publicável de `TR_SUPABASE_URL` e `TR_SUPABASE_ANON_KEY`. Ele expõe login, clube permanente, upload de escudo, histórico público, resultado oficial e confirmação de título. O arquivo não possui nem aceita chaves secretas.

Antes de conectar telas reais, valide o projeto com uma conta de cada papel: proprietário de clube, editor de organização, visualizador e usuário sem vínculo. Não importe automaticamente dados do laboratório: uma competição real deve nascer com autenticação e vínculos explícitos.

## Interface local atual

`/entrar` usa Supabase Auth para entrar, criar conta e recuperar senha. `/painel` e as rotas sob `/painel/campeonatos` exigem sessão; as ações oficiais passam pela RLS do banco. `/c/{uuid}` publica somente competições com `visibility = 'public'`, e `/clubes/{uuid}` mostra participações e títulos públicos de clubes ativos. O laboratório permanece separado em `/demonstracao`.

O formulário de resultado chama `set_match_result`; status, horário e pênaltis ainda precisam de um fluxo administrativo completo. A criação de jogadores depende de um modelo novo, inexistente nesta migration. Antes de usar o painel com dados oficiais, execute os testes com contas de diferentes papéis descritos acima.

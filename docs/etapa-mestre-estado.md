# Etapa mestre — estado da implementação local

## Entregue

- Páginas institucionais separadas por URL: `/`, `/funcionalidades`, `/como-funciona`, `/campeonatos`, `/demonstracao`, `/planos` e `/entrar`. A homepage preserva o estádio, o gramado e a marca; o painel fictício ficou na demonstração.
- Acesso via Supabase Auth com login, cadastro, recuperação de senha, sessão persistente, logout e proteção de `/painel`.
- Painel real por organização: resumo com contagens derivadas de registros, listagem, criação de campeonato privado e temporada, associação de clube existente, cadastro de clube permanente, agendamento de partidas e gravação de resultados via `set_match_result`.
- Separação entre dados locais fictícios e dados oficiais. O laboratório continua no navegador; as telas oficiais usam a chave publicável, autenticação e RLS do Supabase.
- Páginas públicas permanentes `/c/{uuid}` e `/clubes/{uuid}`. Competição privada não é exibida. Classificação pública usa só placares confirmados da liga/fase de grupos; títulos são consultados da tabela oficial.
- Controle explícito de publicação no painel; nenhuma competição foi publicada por esta implementação.
- Capturas reais sem autenticação em `captures/auditoria-geral/` (desktop 1440 px e mobile 390 px). O painel de um usuário autenticado não foi capturado, pois não há credenciais de teste fornecidas.

## Verificação

| Verificação | Resultado |
|---|---|
| Supabase Auth e tabelas `competitions`, `competition_seasons`, `matches` | HTTP 200 com chave publicável, somente leitura |
| Build e TypeScript | Passam |
| Testes automatizados existentes | 17 passam |
| Navegação institucional | 7 rotas × 2 larguras, sem rolagem horizontal ou erro JS |
| Fluxo visual do laboratório | 8 larguras (320–1440 px), abas, persistência e atualização da classificação |
| Galeria e PWA offline | 7 larguras, cache atualizado e navegação na nova rota |
| Regressão responsiva das prévias | 182 verificações em 7 larguras, sem erros de console ou rolagem horizontal |
| Acesso anônimo ao painel | Redireciona para `/entrar` |
| URL pública inexistente | Estado vazio, sem dados fictícios |

## Navegação entregue

| Ação | Destino | Permissão | Fonte de dados |
|---|---|---|---|
| Menu institucional | URLs `/`, `/funcionalidades`, `/como-funciona`, `/campeonatos`, `/demonstracao`, `/planos` | Pública | Conteúdo institucional e laboratório isolado |
| Criar meu campeonato | `/entrar?retorno=/painel/campeonatos/novo` | Conta Supabase | Competição oficial após autenticação |
| Entrar, criar conta, recuperar senha | `/entrar` | Pública | Supabase Auth |
| Visão geral e campeonatos | `/painel`, `/painel/campeonatos` | Membro da organização | Supabase com RLS |
| Nova competição | `/painel/campeonatos/novo` | Proprietário, administrador ou editor | `competitions` e `competition_seasons` |
| Partidas e resultados | `/painel/campeonatos/{uuid}/resultados` | Leitura para membro; edição para editor ou superior | `matches` e RPC `set_match_result` |
| Página de competição | `/c/{uuid}` | Pública apenas se publicada | Competições, temporadas, partidas, participantes e títulos oficiais |
| Histórico do clube | `/clubes/{uuid}` | Pública apenas para clube ativo | Participações e títulos oficiais públicos |
| Compartilhar | Botão da página `/c/{uuid}` | Pública | Web Share ou cópia do link |

## Pendente de validação no ambiente oficial

1. Testar com contas reais de proprietário, editor, visualizador e pessoa de outra organização; a sondagem anônima não prova o comportamento de escrita nem o isolamento entre organizações.
2. Conferir o esquema remoto inteiro contra a migration antes de qualquer alteração de banco. Nenhum SQL novo foi criado ou aplicado.
3. Validar criação de organização, clube, competição, temporada, partida, upload de escudo e correção de placar com uma conta de teste. Nenhuma dessas ações foi executada no banco remoto nesta etapa.
4. Completar a edição de status/horário, pênaltis e critérios de regulamento no fluxo oficial. A gravação atual cobre placar e estado `completed`/`confirmed` pelo RPC existente.
5. Configurar metadados OpenGraph específicos por campeonato no servidor. Hoje há metadados genéricos no HTML e título atualizado no navegador.
6. Cadastrar jogadores requer modelo de dados novo: não há tabela de atletas na migration existente. O painel mostra `—` em vez de inventar contagens.

O site não foi publicado em produção e nenhum registro oficial foi criado, alterado ou apagado durante esta execução.

## Arquivos modificados nesta etapa

- `server.mjs`, `package.json`.
- `dist/index.html`, `dist/route-pages.css`, `dist/route-pages.mjs`, `dist/real-bootstrap.mjs`, `dist/real-app.css`, `dist/panel.html`, `dist/competition.html`, `dist/club.html`, `dist/landing.mjs`, `dist/gallery-stage05.mjs`, `dist/app.mjs`, `dist/sw.js`.
- `src/real-app.ts`, `src/showcase.tsx`, e os artefatos gerados `dist/real-app.js` e `dist/showcase.js` (com mapas de fontes).
- `scripts/audit-supabase.mjs`, `scripts/route-qa.mjs`, `scripts/master-qa.mjs`, `scripts/visual-qa.mjs`, `scripts/stage05-qa.mjs`, `scripts/stage06-responsive-qa.mjs`.
- `docs/auditoria-mestre-inicial.md`, `docs/etapa-mestre-estado.md`, `supabase/README.md`.
- `captures/auditoria-geral/` (capturas geradas).

# TR Campeonatos — auditoria inicial (22/10/2026)

Esta auditoria descreve o código local antes da separação de páginas. Existem URL e chave publicável em `.env.local`; nenhuma chave foi copiada para este documento. Uma sondagem somente leitura com a chave pública e os certificados do Windows retornou HTTP 200 para Auth, `competitions`, `competition_seasons` e `matches`. Isso confirma conectividade e existência desses endpoints, mas não prova a versão integral do esquema, permissões autenticadas, dados ou contas utilizáveis. A consulta anônima a `club_lifetime_stats` retornou HTTP 401.

## Arquitetura atual

- Site servido por `server.mjs` em `127.0.0.1:45321`, com HTML e CSS em `dist/`, JavaScript modular e componentes React em `src/showcase.tsx`.
- A navegação institucional usa âncoras em `dist/index.html`; o servidor só entrega arquivos físicos, sem fallback para rotas de página.
- O laboratório em `dist/app.mjs` grava simulações no `localStorage`. `dist/home-panel.mjs` e `dist/system-pages.mjs` exibem prévias com dados de demonstração; o segundo usa inclusive campeonatos, resultados e atividades estáticas.
- `dist/supabase-real-mode.mjs` contém login por senha e algumas operações REST/RPC, mas não há fluxo de conta integrado à navegação, painel autenticado, criação de competição ou página pública permanente.
- `supabase/migrations/202610220001_sports_memory.sql` define organizações, clubes, competições, temporadas, participantes, partidas, títulos, auditoria, funções e políticas RLS. É um esquema proposto no repositório; sua aplicação remota precisa ser verificada antes de qualquer migração.

## Funcionalidades

| FUNCIONALIDADE | SITUAÇÃO ATUAL | PROBLEMA | CORREÇÃO NECESSÁRIA |
|---|---|---|---|
| Homepage/hero | Visual de estádio, logo e gramado implementado | A mesma página inclui painel e laboratório | Preservar hero e criar páginas institucionais reais |
| Navegação principal | Links `#...` na página única | Não há URLs independentes | Rotas HTTP e links para cada área |
| Painel demonstrativo | Prévias interativas/estáticas identificadas como demonstração | Pode ser confundido com painel real | Manter exclusivamente no ambiente de demonstração |
| Laboratório | Funcional e isolado em `localStorage` | Sem sincronização entre dispositivos, por projeto | Preservar como demonstração; nunca misturar com dados oficiais |
| Login | Função `signInWithPassword` isolada | Sem tela, sessão renovável, recuperação ou guarda de rota | Integrar Supabase Auth ao painel real |
| Painel do organizador real | Não encontrado | Indicadores e ações reais inexistentes | Consultas por organização e permissões, estados vazios |
| Criar campeonato real | Tabelas SQL propostas; sem formulário | Botões de prévia ficam desativados/levam à demonstração | Formulário autenticado, validação e gravação conforme RLS |
| Editar resultados reais | RPC `set_match_result` no código | Sem lista contextual nem formulário integrado | Tela por competição e filtros, edição auditada por RPC |
| Campeonato público | Leitura de cartões públicos, sem link de detalhe | Não há URL permanente nem página detalhada | Rota pública por identificador estável e leitura segura |
| Histórico e galeria | Componentes e consultas parciais; demo também apresenta exemplos | Dependem de dados oficiais e do esquema remoto | Integrar somente registros confirmados com estados vazios |
| Segurança | RLS descrita em SQL; chave publicável no cliente | Estado aplicado do banco e testes de papéis não comprovados | Auditar RLS no ambiente real e testar acesso cruzado |
| Responsividade/PWA | CSS responsivo e service worker existentes | Novas rotas exigirão revisão do cache e das telas | Testar larguras e navegação direta/instalação |

## Matriz de navegação inicial

| Ação | Destino atual | Destino desejado | Permissão | Situação |
|---|---|---|---|---|
| Logo/Início | `#inicio` | `/` | Pública | Âncora |
| Funcionalidades | `#funcionalidades` | `/funcionalidades` | Pública | Âncora |
| Como funciona | `#como-funciona` | `/como-funciona` | Pública | Âncora |
| Campeonatos | `#campeonatos` | `/campeonatos` | Pública | Âncora, cards sem detalhe |
| Planos | `#planos` | `/planos` | Pública | Âncora |
| Demonstração | `#demonstracao` | `/demonstracao` | Pública | Âncora, laboratório funcional |
| Entrar | Texto “em breve” | `/entrar` | Pública | Sem função na UI |
| Criar meu campeonato | `#demonstracao` | `/painel/campeonatos/novo` após login | Autenticada | Apenas demo |
| Cartão de campeonato público | Sem link | `/c/{id-ou-slug}` | Pública | Não implementado |
| Editar resultado | Ausente no painel real | `/painel/campeonatos/{id}/resultados` | Editor/administrador | RPC isolada |

## Dependências antes de alterar dados remotos

1. Confirmar conexão, versão do esquema e políticas efetivamente aplicadas no Supabase existente.
2. Verificar contas e organizações de teste com papéis distintos. A presença de `.env.local` não prova implantação.
3. Comparar o esquema remoto com a migration local antes de criar ou modificar qualquer tabela.
4. Preservar os registros oficiais e nunca importar automaticamente o laboratório.

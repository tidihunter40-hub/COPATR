# TR Campeonatos — auditoria local de 24/10/2026

## Escopo e evidência

O projeto existente foi iniciado em `http://127.0.0.1:47777` e inspecionado com Chromium nas larguras **320, 375, 390, 430, 768, 1024 e 1440 px**. Foram percorridas a página inicial, login, campeonatos, portal demonstrativo, jogos, detalhes, classificação, equipes e estatísticas. O roteiro e as medidas estão em [`scripts/final-audit-qa.mjs`](../scripts/final-audit-qa.mjs) e [`resultado.json`](../captures/auditoria-final-2026-10-24/resultado.json). As imagens são capturas reais desse servidor local; o campeonato Copa TR E-SPORTS 2026 é **demonstração com dados fictícios**, identificada na própria página.

O navegador conseguiu consultar a leitura pública do Supabase (`competitionsStatus: ready`) nas capturas de 390 e 1440 px e recebeu lista vazia de competições publicadas. Uma consulta de diagnóstico via Node falhou na validação da cadeia TLS (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). A leitura pública no navegador não comprova autenticação, políticas RLS de escrita, existência das funções SQL nem publicação real. Nenhuma migration, escrita no banco ou alteração de dados oficiais foi feita.

## Resultado

- **Build:** aprovado (`npm test` executou `npm run build`).
- **Typecheck:** aprovado (`npm run typecheck`).
- **Testes:** 29 aprovados, 0 falhas. Os cenários isolados cobrem vitória 3 × 0, empate 1 × 1, partida sem placar e correção de resultado sem pontuação acumulada.
- **Servidor:** sintaxe aprovada (`node --check server.mjs`); resposta local HTTP 200 nas rotas auditadas.
- **Navegador:** sete larguras sem rolagem horizontal, imagens visíveis sem falha de carregamento e nenhum erro de console ou exceção de página capturado. Filtros separaram 3 resultados e 12 jogos por disputar; classificação expandiu em desktop e mobile; menu mobile, controles do login, cópia do link e retorno dos detalhes foram verificados.

## Estado das funcionalidades

| Função | Estado | Evidência e limite |
|---|---|---|
| Página inicial, login e navegação pública | **APROVADA** | Abertura no navegador, menu mobile e controles de senha/cadastro testados nas sete larguras. |
| Login do organizador com credenciais | **NÃO TESTADA** | Não havia conta de teste autenticada disponível. |
| Proteção visual de `/painel` e `/admin` | **APROVADA** | Sessão anônima foi redirecionada a `/entrar`, sem renderizar o painel. |
| Autorização e bloqueio de escrita no backend | **NÃO TESTADA** | SQL e testes estáticos existem; faltam migration comprovada e testes com papéis reais. |
| Dashboard autenticado e logout | **NÃO TESTADA** | Dependem de sessão de organizador. As capturas de “painel acesso anônimo” mostram somente a proteção. |
| Criação oficial de campeonato e temporada | **NÃO TESTADA** | Fluxo depende do banco e das funções SQL. |
| Cadastro oficial de equipes e upload de escudos | **NÃO TESTADA** | Sem execução autenticada; arquivos originais da demonstração carregaram corretamente. |
| Cadastro persistente de jogadores | **PENDENTE** | O esquema e a interface atual ainda não implementam esse fluxo. |
| Criação e agenda oficial de partidas | **NÃO TESTADA** | O motor local e as 15 partidas da demonstração funcionaram; persistência não verificada. |
| Registro e correção oficial de placares | **NÃO TESTADA** | RPC `set_match_result` não foi exercitada contra o banco. |
| Placar, vencedor e escudo em teste isolado | **APROVADA** | Testes cobrem 3 × 0, 1 × 1, jogo agendado e correção; navegador mostrou 3 × 0 e VS. |
| Classificação e desempates na demonstração | **APROVADA** | Pontos, saldo, aproveitamento, últimos resultados e expansão foram conferidos; cálculo automatizado passou nos testes. |
| Classificação oficial derivada do banco | **NÃO TESTADA** | Sem campeonato publicado ou placar confirmado no ambiente remoto. |
| Estatísticas da temporada na demonstração | **APROVADA** | Resultados, jogos futuros e gols derivam das partidas do cenário local. |
| Estatísticas individuais e súmula | **PENDENTE** | Ainda não há cadastro de atletas/súmula. |
| Histórico de clubes oficiais | **NÃO TESTADA** | Código e SQL presentes, sem dados públicos remotos para navegação. |
| Publicação e link oficial `/c/{uuid}` | **NÃO TESTADA** | Não foi criada nem publicada competição real. |
| Compartilhamento do link demonstrativo | **APROVADA** | A opção de copiar produziu a URL atual e exibiu “Link copiado”; compartilhamento nativo e WhatsApp não foram exercitados. |
| Portal de demonstração sem login | **APROVADA** | Portal, seções, filtros, detalhes, classificação, equipes e retorno navegados em sessão anônima. |
| Portal oficial sem login e permissões RLS | **NÃO TESTADA** | A lista pública remota estava vazia; teste backend com visitante e contas de papéis distintos permanece necessário. |

## Problemas confirmados e correções

1. A página inicial mostrava números de campeonatos, atletas e satisfação sem fonte verificável. Foram substituídos por recursos apresentados pela aplicação em [`dist/index.html`](../dist/index.html).
2. Cards de equipes da demonstração apontavam a `/clubes/{uuid}`, rota de perfil oficial inexistente para aqueles dados fictícios. A demonstração agora mostra cards sem esse link; os links de clubes oficiais continuam disponíveis no portal real em [`src/real-app.ts`](../src/real-app.ts).
3. Em 390 px, três cards de equipes por linha quebravam nomes no meio de palavras. A grade passa a ter duas colunas até 430 px em [`dist/public-arena.css`](../dist/public-arena.css). Os escudos originais não foram alterados.

Os testes de motor e confronto em [`tests/engine.test.mjs`](../tests/engine.test.mjs) e [`tests/public-fixture.test.mjs`](../tests/public-fixture.test.mjs) foram alinhados aos placares exatos solicitados. O diagnóstico de conexão em [`scripts/check-supabase-connectivity.mjs`](../scripts/check-supabase-connectivity.mjs) apenas lê o endpoint público e não expõe a chave.

## Capturas do sistema local

| Tela | Desktop 1440 px | Mobile 390 px |
|---|---|---|
| Início | [Imagem](../captures/auditoria-final-2026-10-24/inicio-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/inicio-390.png) |
| Login | [Imagem](../captures/auditoria-final-2026-10-24/login-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/login-390.png) |
| Campeonatos públicos | [Imagem](../captures/auditoria-final-2026-10-24/campeonatos-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/campeonatos-390.png) |
| Portal demonstrativo | [Imagem](../captures/auditoria-final-2026-10-24/portal-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/portal-390.png) |
| Jogos | [Imagem](../captures/auditoria-final-2026-10-24/jogos-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/jogos-390.png) |
| Detalhes da partida | [Imagem](../captures/auditoria-final-2026-10-24/detalhes-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/detalhes-390.png) |
| Classificação | [Imagem](../captures/auditoria-final-2026-10-24/classificacao-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/classificacao-390.png) |
| Classificação expandida | [Imagem](../captures/auditoria-final-2026-10-24/classificacao-expandida-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/classificacao-expandida-390.png) |
| Equipes | [Imagem](../captures/auditoria-final-2026-10-24/equipes-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/equipes-390.png) |
| Estatísticas | [Imagem](../captures/auditoria-final-2026-10-24/estatisticas-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/estatisticas-390.png) |
| Proteção do painel anônimo | [Imagem](../captures/auditoria-final-2026-10-24/painel-acesso-anonimo-1440.png) | [Imagem](../captures/auditoria-final-2026-10-24/painel-acesso-anonimo-390.png) |

## Antes de declarar o modo oficial aprovado

Confirmar no projeto Supabase de destino a aplicação da migration `202610230003_authorization_and_publication.sql` e testar, com contas isoladas de proprietário, editor, leitor, suspensa e visitante, os fluxos de criação, escudo, partida, resultado, correção, publicação, leitura anônima, negativa de escrita e logout. Capturar então o dashboard autenticado em 390 e 1440 px. A ausência dessas evidências impede a aprovação final do painel e da segurança do backend.

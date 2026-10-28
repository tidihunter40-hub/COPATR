# COPATIDI — estado da homologação RC2

Atualizado em 28 de outubro de 2026. Candidato `corujao-8-rc2` na branch `codex/corujao-8-rc2`.

**Veredito: LANÇAMENTO BLOQUEADO.** A prévia original RC2 foi validada e a primeira matriz com quatro contas reais passou nos casos de leitura, criação, edição e RPCs básicos. A revisão seguinte encontrou um bloqueio de RLS no gatilho de inscrição entre organizações. A correção foi testada localmente e aplicada no Supabase; a matriz completa ainda está pendente. Nenhuma publicação em produção ocorreu.

| Área | Resultado |
| --- | --- |
| Motor esportivo de oito equipes | Aprovado na homologação RC1 do Supabase real: grupos, 12 jogos, sorteios auditáveis, semifinais, pênaltis, final, campeão e vice. Nenhuma funcionalidade foi reconstruída. |
| Banco | Objetos da migration `202610270004` confirmados pelas consultas anteriores. A migration `202610280001` foi aplicada no Supabase; a consulta posterior confirmou `security_definer=true`, comparação instalada e gatilho ativo. `to_regclass('supabase_migrations.schema_migrations')` retornou nulo: as alterações manuais funcionam, mas não há tabela de histórico formal de migrations nesse projeto. |
| Segurança entre organizações | **Pendente da matriz completa com quatro JWTs.** Quatro sessões Auth reais funcionaram depois de ativar os três perfis QA como `organizer/approved`. O proprietário, editor A, leitor A e editor B viram apenas as organizações e campeonatos privados previstos; alterações cruzadas, publicação, criação indevida e progressão foram negadas. O teste local em PGlite reproduziu uma brecha no gatilho de inscrição: uma equipe B oculta por RLS podia ser inscrita na organização A. A nova função em `202610280001` bloqueou esse caso no teste local e preservou as equipes legadas sem organização. Nenhuma conta QA foi vinculada à organização existente com seis campeonatos. |
| `npm run typecheck`, `npm test`, `npm run build` | Passaram após a correção; 127 testes. Dois builds consecutivos foram executados para verificar a geração repetível das páginas. |
| Interface Corujão local | `verify-corujao-advance-ui.mjs` passou a 390, 768 e 1440 px, sem rolagem horizontal ou erro de página. O teste `verify-public-showcase.mjs` foi atualizado e passou nas três larguras com catálogo vazio, campeonato publicado, dados da temporada, busca e falha da API. |
| PWA local | Manifesto e ícones válidos, service worker controlador, cache `v67`, cache anterior removido, rotas públicas demonstrativas disponíveis offline e rotas privadas/oficiais retornando 503 offline. Zero erros JavaScript após corrigir a duplicação de `const mobile` no build. Aparelho físico pendente. |
| Prévia Vercel | **Criada e validada.** Deploy corrigido `dpl_ECN6bRwYVvWiA3Pri6jqogTnpBeo`, URL `https://copatr-am8xuhlt9-ogaitjunior-sudos-projects.vercel.app`, estado READY, target de prévia. Enviada de um arquivo limpo do commit `a5d593e`; dez arquivos críticos conferiram com o manifesto (HTML sem o script de feedback injetado pela Vercel; service worker e manifest com finais de linha normalizados). Rotas principais retornaram 200, a configuração apontou para o Supabase esperado, e nenhuma promoção de produção ocorreu. |

## Desempenho móvel local

Cinco execuções por rota a 390 × 844 px, 1,6 Mbps, latência 150 ms, CPU 4×, cache e service worker desligados:

| Rota | LCP mediano (faixa) | CLS | Transferência | Elemento LCP |
| --- | --- | --- | --- | --- |
| Inicial | 1,996 s (1,956–2,096) | 0,00058 | 509.776 bytes | `SECTION.hero`, AVIF de 800 px |
| Corujão público | 2,488 s (2,236–2,588) | 0,00021 | 817.870 bytes | `DIV.public-hero`, AVIF de 800 px |

O LCP público foi identificado antes do ajuste. O pré-carregamento da imagem responsiva no HTML reduziu o atraso local, mas os números **não representam o deploy**. O RC1 publicado teve medianas de 4,684 s na inicial e 3,120 s na vitrine pública com o mesmo perfil. Os dados brutos locais ficam em `artifacts/`, fora do Git e do deploy.

Na **primeira prévia RC2** (`dpl_Dmi1o7bQ1T9sXkKviZxDwJ4jrLds`), cinco medições por rota com o mesmo perfil móvel, cache e service worker desligados, resultaram em:

| Rota da prévia | LCP mediano (faixa) | CLS | Transferência |
| --- | --- | --- | --- |
| Inicial | 1,988 s (1,956–2,104) | 0 | 519.635 bytes |
| Corujão público | 2,532 s (2,256–3,412) | 0 | 832.265 bytes |

As dez respostas foram HTTP 200 e nenhuma apresentou rolagem horizontal em 390 px. A mediana inicial caiu 57,6% e a do Corujão público caiu 18,8% em comparação às medianas RC1 medidas no mesmo perfil. Os dados brutos estão em `artifacts/rc2-preview-performance.jsonl`. A interface de progressão passou a 390, 768 e 1440 px na prévia com dados simulados. A vitrine oficial de demonstração passou nas três larguras, com placares e classificação corretos. O PWA publicado passou: manifest e ícones, service worker controlador, cache `v67`, remoção do cache antigo, páginas demonstrativas offline e rotas privadas/oficiais HTTP 503 offline; zero erros JavaScript. Aparelho físico continua pendente.

Na **prévia corrigida** (`dpl_ECN6bRwYVvWiA3Pri6jqogTnpBeo`), as cinco medições por rota deram LCP mediano de **2,132 s** na inicial (2,100–2,356 s) e **2,712 s** no Corujão público (2,588–2,852 s). O CLS mediano foi 0,00058 e 0,00021, respectivamente; as transferências medianas foram 519.635 e 832.265 bytes. Os elementos LCP foram `SECTION.hero` e `DIV.public-hero`. As dez respostas foram HTTP 200, sem rolagem horizontal em 390 px. Em relação ao RC1, as medianas caíram 54,5% e 13,1%. A interface de progressão passou a 390, 768 e 1440 px e o PWA passou novamente com cache `v67`, remoção do cache antigo e zero erros JavaScript. Dados brutos em `artifacts/rc2-preview-a5d593e-performance.jsonl`.

## Pacote e publicação

`docs/corujao-8-rc2-manifest.json` registra hashes SHA-256 por arquivo, 383 arquivos de saída e hash da árvore de deploy. O manifesto RC1 permanece separado e inalterado. `.vercelignore` exclui evidências, documentos, ambiente local, dependências e arquivos temporários da entrada da Vercel. `prepare-vercel-output.mjs` remove configuração local e mapas JavaScript da saída.

Novo deploy de prévia: `dpl_ECN6bRwYVvWiA3Pri6jqogTnpBeo`. Prévia RC2 anterior: `dpl_Dmi1o7bQ1T9sXkKviZxDwJ4jrLds`; prévia RC1: `dpl_CUZsU4XpXNVNEWzhr1bQbS4gqjRR`. Deploy de produção confirmado na Vercel: `dpl_DW8z1XUyEbscWEM1mDBqvG7EXYtx`. O procedimento de rollback, após eventual promoção autorizada, é usar **Instant Rollback** para esse deploy de produção e repetir a checagem do domínio oficial. Até a autorização, a produção permanece nesse deploy.

## Para fechar a homologação

1. Repetir a matriz completa com quatro JWTs reais nas duas organizações privadas, cobrindo todas as operações críticas e verificando o estado após cada tentativa proibida. Não registrar credenciais em chat, logs ou Git.
2. Executar teste físico caso haja aparelho disponível.

Não solicitar autorização de produção até que os itens obrigatórios passem.

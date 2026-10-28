# COPATIDI — estado da homologação RC2

Atualizado em 28 de outubro de 2026. Candidato `corujao-8-rc2` na branch `codex/corujao-8-rc2`.

**Veredito: RC2 PUBLICADO, APROVADO COM RESSALVAS.** O proprietário autorizou a promoção da prévia corrigida. O motor esportivo, a matriz completa com quatro JWTs reais, os testes, a prévia e as verificações posteriores no domínio oficial passaram. A brecha de RLS no gatilho de inscrição foi corrigida e validada. Restam o teste em aparelho físico, se disponível, e a ausência de histórico formal de migrations no projeto.

| Área | Resultado |
| --- | --- |
| Motor esportivo de oito equipes | Aprovado na homologação RC1 do Supabase real: grupos, 12 jogos, sorteios auditáveis, semifinais, pênaltis, final, campeão e vice. Nenhuma funcionalidade foi reconstruída. |
| Banco | Objetos da migration `202610270004` confirmados pelas consultas anteriores. A migration `202610280001` foi aplicada no Supabase; a consulta posterior confirmou `security_definer=true`, comparação instalada e gatilho ativo. `to_regclass('supabase_migrations.schema_migrations')` retornou nulo: as alterações manuais funcionam, mas não há tabela de histórico formal de migrations nesse projeto. |
| Segurança entre organizações | **Aprovada na matriz completa com quatro JWTs Auth reais.** Proprietário, editor A, leitor A e editor B tiveram a leitura prevista; criação e edição próprias passaram. Foram bloqueadas as tentativas indevidas de ler/alterar dados privados, criar e inscrever equipes, registrar resultado, alterar resultado por PATCH direto, confirmar sorteio, avançar fase, publicar, elevar membro e executar revisão administrativa. O script verificou o estado após cada tentativa proibida. O teste PGlite reproduziu a brecha antiga de RLS e comprovou a correção `202610280001`. A consulta final no Supabase mostrou **2 campeonatos QA privados, 0 públicos, 0 inscrições cruzadas, 5 vínculos QA e 1 resultado confirmado de teste**. Nenhuma conta QA foi vinculada à organização existente com seis campeonatos. |
| `npm run typecheck`, `npm test`, `npm run build` | Passaram após a correção; 127 testes. Dois builds consecutivos foram executados para verificar a geração repetível das páginas. |
| Interface Corujão local | `verify-corujao-advance-ui.mjs` passou a 390, 768 e 1440 px, sem rolagem horizontal ou erro de página. O teste `verify-public-showcase.mjs` foi atualizado e passou nas três larguras com catálogo vazio, campeonato publicado, dados da temporada, busca e falha da API. |
| PWA local | Manifesto e ícones válidos, service worker controlador, cache `v67`, cache anterior removido, rotas públicas demonstrativas disponíveis offline e rotas privadas/oficiais retornando 503 offline. Zero erros JavaScript após corrigir a duplicação de `const mobile` no build. Aparelho físico pendente. |
| Prévia Vercel | **Criada e validada.** Deploy corrigido `dpl_ECN6bRwYVvWiA3Pri6jqogTnpBeo`, URL `https://copatr-am8xuhlt9-ogaitjunior-sudos-projects.vercel.app`, estado READY. Enviada de um arquivo limpo do commit `a5d593e`; dez arquivos críticos conferiram com o manifesto (HTML sem o script de feedback injetado pela Vercel; service worker e manifest com finais de linha normalizados). Rotas principais retornaram 200 e a configuração apontou para o Supabase esperado. |
| Produção Vercel | **Publicada e verificada.** `vercel promote dpl_ECN6bRwYVvWiA3Pri6jqogTnpBeo` criou o deployment de produção `dpl_HDdidHjhDi6uvGweNY3ad9PHYsKo`, estado READY, confirmado em `copatr.vercel.app`. Dez arquivos críticos conferiram com o manifesto e as rotas principais responderam HTTP 200. A vitrine pública passou em 390, 768 e 1440 px, com os placares e classificação esperados; o Corujão público respondeu HTTP 200 em 390 px sem rolagem horizontal. O PWA passou no domínio oficial, e a leitura anônima de um campeonato privado retornou zero linhas para competição, temporada, inscrições e partidas. |

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

Na **prévia corrigida** (`dpl_ECN6bRwYVvWiA3Pri6jqogTnpBeo`), as cinco medições por rota deram LCP mediano de **2,132 s** na inicial (2,100–2,356 s) e **2,712 s** no Corujão público (2,588–2,852 s). O CLS mediano foi 0,00058 e 0,00021, respectivamente; as transferências medianas foram 519.635 e 832.265 bytes. Os elementos LCP foram `SECTION.hero` e `DIV.public-hero`. As dez respostas foram HTTP 200, sem rolagem horizontal em 390 px. Em relação ao RC1, as medianas caíram 54,5% e 13,1%. A interface de progressão e a vitrine pública de demonstração passaram a 390, 768 e 1440 px; os dois placares e a classificação foram conferidos. O PWA passou novamente com cache `v67`, remoção do cache antigo e zero erros JavaScript. Dados brutos em `artifacts/rc2-preview-a5d593e-performance.jsonl`.

## Pacote e publicação

`docs/corujao-8-rc2-manifest.json` registra hashes SHA-256 por arquivo, 383 arquivos de saída e hash da árvore de deploy. O manifesto RC1 permanece separado e inalterado. `.vercelignore` exclui evidências, documentos, ambiente local, dependências e arquivos temporários da entrada da Vercel. `prepare-vercel-output.mjs` remove configuração local e mapas JavaScript da saída.

Deploy de produção RC2: `dpl_HDdidHjhDi6uvGweNY3ad9PHYsKo`. Prévia promovida: `dpl_ECN6bRwYVvWiA3Pri6jqogTnpBeo`; prévia RC2 anterior: `dpl_Dmi1o7bQ1T9sXkKviZxDwJ4jrLds`; prévia RC1: `dpl_CUZsU4XpXNVNEWzhr1bQbS4gqjRR`. Deploy anterior de produção: `dpl_DW8z1XUyEbscWEM1mDBqvG7EXYtx`. Em caso de falha após a publicação, usar **Instant Rollback** para esse deploy anterior e repetir a checagem do domínio oficial.

## Ressalvas e próxima decisão

1. Teste em aparelho físico não executado; os testes de responsividade e PWA foram feitos no Chromium em 390, 768 e 1440 px.
2. O Supabase não possui a tabela `supabase_migrations.schema_migrations`; as funções e gatilhos foram conferidos no banco real, e as migrations correspondentes estão versionadas no Git.
3. Acompanhar os primeiros organizadores e usar Instant Rollback para `dpl_DW8z1XUyEbscWEM1mDBqvG7EXYtx` se surgir uma falha crítica da versão publicada.

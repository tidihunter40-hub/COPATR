# COPATIDI — estado da homologação RC2

27 de outubro de 2026. Candidato `corujao-8-rc2` na branch `codex/corujao-8-rc2`.

**Veredito: LANÇAMENTO BLOQUEADO.** O pacote está versionado e passou nos testes unitários, mas a matriz de segurança com quatro JWTs reais ainda não foi executada e não há novo deploy de prévia comprovado. Nenhuma publicação em produção ocorreu.

| Área | Resultado |
| --- | --- |
| Motor esportivo de oito equipes | Aprovado na homologação RC1 do Supabase real: grupos, 12 jogos, sorteios auditáveis, semifinais, pênaltis, final, campeão e vice. Nenhuma funcionalidade foi reconstruída. |
| Banco | Objetos da migration `202610270004` confirmados pelas consultas anteriores; o painel Supabase mostrou “No migrations” no resumo do projeto, portanto o registro formal de histórico de migrations não está comprovado. |
| Segurança entre organizações | **Pendente.** O projeto Auth tinha apenas a conta do proprietário quando consultado. As três contas temporárias autorizadas ainda não foram criadas e a matriz com quatro JWTs reais ainda não foi executada. `anon` e RLS foram verificados anteriormente, mas isso não substitui a matriz. |
| `npm run typecheck`, `npm test`, `npm run build` | Passaram; 126 testes. Dois builds consecutivos foram executados para verificar a geração repetível das páginas. |
| Interface Corujão local | `verify-corujao-advance-ui.mjs` passou a 390, 768 e 1440 px, sem rolagem horizontal ou erro de página. O script legado `verify-public-showcase.mjs` falhou ao esperar `.public-empty-state`: a vitrine atual usa o catálogo novo; o teste precisa ser atualizado antes de contar como aprovado. |
| PWA local | Manifesto e ícones válidos, service worker controlador, cache `v67`, cache anterior removido, rotas públicas demonstrativas disponíveis offline e rotas privadas/oficiais retornando 503 offline. Zero erros JavaScript após corrigir a duplicação de `const mobile` no build. Aparelho físico pendente. |
| Prévia Vercel | **Pendente.** A branch está no GitHub, mas o projeto Vercel não está conectado ao repositório; o push não criou deploy. A CLI oficial foi instalada temporariamente pelo npm, porém `vercel whoami` falhou por erro de rede. Não existe ID de deploy RC2 validado. |

## Desempenho móvel local

Cinco execuções por rota a 390 × 844 px, 1,6 Mbps, latência 150 ms, CPU 4×, cache e service worker desligados:

| Rota | LCP mediano (faixa) | CLS | Transferência | Elemento LCP |
| --- | --- | --- | --- | --- |
| Inicial | 1,996 s (1,956–2,096) | 0,00058 | 509.776 bytes | `SECTION.hero`, AVIF de 800 px |
| Corujão público | 2,488 s (2,236–2,588) | 0,00021 | 817.870 bytes | `DIV.public-hero`, AVIF de 800 px |

O LCP público foi identificado antes do ajuste. O pré-carregamento da imagem responsiva no HTML reduziu o atraso local, mas os números **não representam o deploy**. O RC1 publicado teve medianas de 4,684 s na inicial e 3,120 s na vitrine pública com o mesmo perfil. Os dados brutos locais ficam em `artifacts/`, fora do Git e do deploy.

## Pacote e publicação

`docs/corujao-8-rc2-manifest.json` registra hashes SHA-256 por arquivo, 383 arquivos de saída e hash da árvore de deploy. O manifesto RC1 permanece separado e inalterado. `.vercelignore` exclui evidências, documentos, ambiente local, dependências e arquivos temporários da entrada da Vercel. `prepare-vercel-output.mjs` remove configuração local e mapas JavaScript da saída.

Deploy anterior de prévia: `dpl_CUZsU4XpXNVNEWzhr1bQbS4gqjRR`. Deploy de produção confirmado na Vercel: `dpl_DW8z1XUyEbscWEM1mDBqvG7EXYtx`. O procedimento de rollback, após eventual promoção autorizada, é usar **Instant Rollback** para esse deploy de produção e repetir a checagem do domínio oficial. Até a autorização, a produção permanece nesse deploy.

## Para fechar a homologação

1. Criar as três contas de QA autorizadas e duas organizações privadas de teste, sem credenciais em chat, logs ou Git. Testar a matriz de operações com quatro JWTs reais e verificar o estado após cada tentativa proibida.
2. Publicar **somente nova prévia** do commit versionado, registrar seu ID e verificar o hash do conteúdo servido contra o manifesto RC2.
3. Repetir as cinco medições por rota no novo deploy, as verificações de interface a 390, 768 e 1440 px, e o PWA publicado.
4. Atualizar o teste legado de vitrine e repetir o fluxo de integração; executar teste físico caso haja aparelho disponível.

Não solicitar autorização de produção até que os itens obrigatórios passem.

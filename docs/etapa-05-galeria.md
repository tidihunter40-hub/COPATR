# Etapa 05 — Galeria de Campeões

A galeria usa o estádio já presente em `dist/assets/stadium-night.webp` e uma taça prateada exclusiva em `dist/assets/gallery-silver-trophy.webp` (WebP com transparência, 278 KB). A imagem foi gerada com a ferramenta integrada de imagem com o pedido: troféu tridimensional prateado para galeria esportiva, metal polido e escovado, reflexos azuis discretos, base sofisticada, objeto inteiro em fundo transparente, sem texto, logo ou marca. O HTML, a arte e os filtros estão limitados à seção `#galeria`.

## Dados oficiais

O esquema existente já fornece `competition_titles`, `competition_seasons`, `competitions` e `clubs`. A consulta pública lê posições 1 e 2; cada cartão é criado apenas a partir de uma posição 1 confirmada. O vice é mostrado quando a posição 2 da mesma temporada está disponível. Escudos são obtidos pelo mecanismo de URLs assinadas já existente. O link usa o perfil permanente `#clube-<id>`. Não houve migração, escrita no Supabase ou mudança em RLS.

Os filtros de modalidade, campeonato, temporada e clube são exibidos somente quando a consulta retorna campeões oficiais. Atuam sobre os registros públicos carregados. A consulta atual traz até 200 registros de posições 1 e 2; uma galeria com volume maior precisará de paginação de servidor para cobrir toda a história sem carregar tudo na homepage.

Sem títulos, a área oficial exibe a mensagem de espera. A prévia de Galatasarrafo utiliza o escudo original e traz `SIMULAÇÃO VISUAL — NÃO OFICIAL`, sem atribuir colocação ou título.

## Validação local

- `npm run typecheck`
- `npm test` (inclui build)
- `npm run visual:qa`
- `node scripts/stage05-qa.mjs` (320, 375, 390, 430, 768, 1024 e 1440 px; navegação, console, cinco capturas, cache e abertura offline)
- `node scripts/stage05-official-qa.mjs` (respostas oficiais simuladas, cartões, vice e quatro filtros)
- `node scripts/stage04-qa.mjs` e `node scripts/stage04-official-qa.mjs` (regressão do perfil e trajetória)
- `node scripts/esports-qa.mjs` (regressão dos escudos e do painel demonstrativo)

A conexão com uma instância real do Supabase não foi exercitada nesta etapa; o teste dos dados oficiais usou respostas simuladas. Nenhum arquivo foi publicado em produção.

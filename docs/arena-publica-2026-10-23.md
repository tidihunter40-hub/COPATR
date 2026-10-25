# Vitrine pública — reconstrução visual da arena

## Comparação com a referência

A referência mostra quatro telas móveis com logo oficial, estádio iluminado, escudos protagonistas, placar eletrônico, central de jogos, detalhes da partida e classificação compacta. A implementação anterior já continha os dados e as rotas dessas áreas, mas os cartões tinham pouco impacto: estádio cortado no celular, escudos de apresentação irregular, placar pequeno e próximos jogos em linhas de texto.

Nesta etapa, o componente compartilhado `publicFixture` passou a renderizar a composição `match-arena` nas partidas em destaque, na agenda e na central de jogos. O CSS usa a imagem local do estádio como camada de cada confronto, luzes e gramado visíveis, borda azul, escudos originais em `object-fit: contain`, placar central e destaque do vencedor somente em resultado confirmado. Empates e jogos agendados mantêm os lados equilibrados. O botão de detalhes leva à partida real ou demonstrativa correspondente.

O cabeçalho móvel centraliza a logo oficial. A classificação móvel mostra posição, equipe, pontos, jogos e saldo sem largura fixa; os demais números ficam disponíveis no detalhe de cada linha. A tela de detalhes mantém somente informações existentes nos registros. A navegação inferior respeita a área segura do dispositivo e mantém os links funcionais.

## Dados e limites

- A rota `/demonstracao/copa-tr-esports` usa dados fictícios em memória, identificados no aviso amarelo. Os escudos são os arquivos fornecidos no projeto. Nenhum placar, atleta, gol individual ou estatística foi criado para preencher o desenho.
- As rotas `/c/:id` usam a mesma renderização com consultas Supabase. Esta execução não validou o banco remoto nem o painel autenticado; a migration de autorização e publicação segue pendente conforme `docs/implementacao-painel-portal-2026-10-23.md`.
- Imagens de escudos com fundo próprio foram preservadas sem recorte. Isso deixa alguns quadrados de fundo visíveis, de acordo com os arquivos cadastrados.

## Verificação

`npm run typecheck` e `npm test` passaram; são 27 testes. O script `node scripts/public-arena-qa.mjs` abriu a demonstração no Chromium em 320, 360, 375, 390, 430, 768, 1024 e 1440 px. Nessas larguras, não houve rolagem horizontal da página nem imagens quebradas. O script também verificou 15 confrontos e os filtros de resultados, próximas partidas e rodada.

Capturas reais do navegador em `captures/arena-publica-2026-10-23/`:

- `inicio-mobile-390.png`, `jogos-mobile-390.png`, `detalhes-mobile-390.png`, `classificacao-mobile-390.png`
- `inicio-desktop-1440.png`, `jogos-desktop-1440.png`, `detalhes-desktop-1440.png`, `classificacao-desktop-1440.png`

As capturas representam a demonstração identificada, não uma competição oficial publicada.

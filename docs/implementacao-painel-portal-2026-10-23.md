# Painel e portal público — implementação local de 23/10/2026

Esta etapa aproveita a arquitetura existente. O laboratório fictício continua separado das rotas oficiais. Nenhum dado oficial foi alterado nem publicado.

## Implementado no código

- A migration `202610230003_authorization_and_publication.sql` retira permissões administrativas de membros com autorização suspensa ou rejeitada, limita a gestão de membros ao proprietário e restringe a leitura pública a participantes confirmados e dados publicados.
- Campeonatos nascem privados e em rascunho. A criação de campeonato e temporada usa uma função transacional. A publicação exige uma temporada com duas equipes confirmadas e ao menos uma partida e passa por uma função autorizada no banco.
- Placares oficiais só podem ser alterados por `set_match_result`; gravações diretas são bloqueadas. A correção regrava o resultado, e a classificação pública é derivada dos registros confirmados, sem acumular pontos duplicados.
- A disputa por pênaltis é registrada em uma função autorizada e auditada, em separado dos gols regulamentares. O painel mostra o formulário apenas em partidas eliminatórias empatadas e confirmadas.
- O portal público mostra escudos salvos, placar, estado e vencedor confirmado. Um empate não destaca equipe; nos pênaltis, destaca a classificada. A tabela de futebol/futsal mostra aproveitamento e os cinco resultados recentes.
- A visão geral do organizador passou a mostrar contagens derivadas dos registros e o campeonato ativo em destaque, com próximo confronto e último resultado quando existirem. A tela de login ganhou a imagem esportiva e a marca oficial na paleta escura.
- A página pública acompanha mudanças de partidas pelo canal Realtime quando disponível e consulta o banco a cada 30 segundos como alternativa. O compartilhamento inclui o recurso nativo do dispositivo ou cópia do link, além de link para WhatsApp.
- O perfil público do clube reúne participações, títulos, seis totais calculados de partidas confirmadas e resultados recentes. A leitura é limitada a competições publicadas.
- O servidor prepara título, descrição e metadados OpenGraph específicos para competições públicas quando consegue consultar o Supabase. `TR_PUBLIC_BASE_URL` permite definir o domínio canônico.
- O cache do PWA recebeu nova versão para entregar os arquivos atualizados; páginas oficiais continuam exigindo conexão.

## Verificação local

- `npm run typecheck`: aprovado.
- `npm test`: 23 testes aprovados, incluindo vitória, empate, jogo agendado e pênaltis no componente público.
- Placar público renderizado no Chromium em 320, 375, 390, 430, 768, 1024 e 1440 px sem rolagem horizontal da página.
- `node --check server.mjs`: aprovado.

## Pendente antes de uso oficial

1. Revisar e aplicar a migration `202610230003_authorization_and_publication.sql` no projeto Supabase correto. O ambiente desta execução não alcançou o host configurado (`ENOTFOUND`), e não há CLI/PostgreSQL local. As funções e políticas SQL não foram executadas em um banco.
2. Validar com contas reais de proprietário, editor, leitor, conta suspensa e visitante: criação, inserção de escudos, publicação, correção de resultado, pênaltis, bloqueio de escrita e atualização em duas sessões. Sem isso, segurança e fluxo completo não podem ser declarados validados.
3. Implementar regras de pontuação específicas de vôlei, basquete e e-sports antes de mostrar classificações dessas modalidades. Hoje seus confrontos podem ser exibidos, mas o portal informa que a classificação por pontos não está configurada.
4. Completar cadastro persistente de atletas, gestão de calendário, galeria oficial, chaveamento conectado, QR Code local, controle de seções públicas, regulamentos personalizados e demais telas administrativas descritas no pedido.
5. Revisar identidade e usabilidade do painel autenticado com dados reais nas larguras exigidas. A ausência de uma conta de teste impediu a inspeção visual dessa área.

Não executar `supabase db push` nem publicar o site sem revisar a migration e escolher o ambiente de destino.

## Evolução visual da vitrine em 23/10/2026

- O painel abre a vitrine pública e as páginas publicadas dos campeonatos em nova aba, com `rel="noopener noreferrer"`, e oferece cópia do link específico do campeonato.
- O portal público oficial apresenta cabeçalho de estádio, placares com escudos originais maiores, seções de início, jogos, classificação, equipes, estatísticas derivadas e conquistas. Jogos podem ser filtrados por situação e rodada.
- A URL pública de cada partida usa `?temporada=<id>&jogo=<id>` e mostra somente dados realmente cadastrados. Súmula e estatísticas de atletas não são inventadas.
- A Copa TR E-SPORTS 2026 permanece demonstrativa, com seis escudos fornecidos, 15 confrontos únicos e apenas os três resultados solicitados na rodada inicial. As demais partidas não têm placar.
- O compartilhamento usa a API nativa ou a área de transferência; quando ambas estão indisponíveis, mostra o link selecionável.
- `npm test`: 27 testes aprovados. `npm run typecheck` e build aprovados. Em QA local com dados fictícios, dez larguras de 319 a 1920 px não apresentaram rolagem horizontal da página; console sem erros. Capturas em `captures/vitrine-publica-2026-10-23/` têm aviso visível de cenário local de teste.
- O backend remoto e o painel autenticado não foram validados nesta etapa. A migration de autorização/publicação documentada acima ainda precisa ser aplicada e testada no Supabase correto antes de uso oficial. As capturas não representam campeonatos reais publicados.

### Demonstração navegável

A rota `/demonstracao/copa-tr-esports` usa os mesmos componentes do portal público com um adaptador de dados somente em memória. A página mostra aviso permanente de dados fictícios, possui `noindex`, mantém os detalhes na própria rota e não instancia o cliente oficial do Supabase. O painel abre essa demonstração em nova aba; `/demonstracao` oferece um atalho para ela e mantém o laboratório local existente. O service worker inclui os arquivos da nova página e mantém o ambiente oficial dependente de conexão.

A rota foi conferida no navegador local, inclusive abertura dos detalhes e retorno aos jogos. Capturas diretas dessa demonstração: demo-vitrine-mobile.png, demo-partida-mobile.png e demo-vitrine-desktop.png no diretório de capturas acima.


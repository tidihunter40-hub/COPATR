# Classificação premium — TR Campeonatos

## O que mudou

A classificação pública usa agora o mesmo ambiente azul e grafite dos confrontos, com iluminação discreta no cabeçalho, linhas mais espaçosas, escudos originais em espaços padronizados e destaque azul e prata para a liderança. O líder só aparece quando existe ao menos uma partida confirmada. O destaque do vencedor permanece exclusivo dos cartões de confronto.

No desktop, a tabela conserva PTS, J, V, E, D, GP, GC, SG e últimos cinco resultados e passa a mostrar aproveitamento. O botão de cada equipe abre uma linha completa com números, indicadores de forma e até três partidas confirmadas disponíveis. No celular, cada linha apresenta posição, escudo, equipe, pontos, jogos e saldo; a expansão revela as demais estatísticas e o histórico.

Os percentuais são derivados da pontuação atual de 3 pontos por vitória e 1 por empate. Sem partida confirmada, o aproveitamento aparece como `—`. Os indicadores de vitória, empate e derrota mantêm verde, cinza e vermelho apenas nos resultados.

## Dados preservados e limite conhecido

Nenhum placar, participante ou critério de ordenação foi alterado. A classificação continua calculada das partidas confirmadas nas fases de liga e grupos, com a ordenação já existente no portal: pontos, saldo de gols, gols marcados e nome. O projeto não possui configuração persistida de critérios de desempate; por isso não foi criado um novo critério nesta etapa. O histórico expandido mostra somente partidas confirmadas já retornadas para a temporada.

A apresentação foi verificada na rota de demonstração, identificada como fictícia. A rota oficial usa o mesmo código de renderização, mas o banco remoto e o painel autenticado não foram acessados nesta execução.

## Verificação

- `npm run typecheck`: aprovado.
- `npm test`: 29 testes aprovados, incluindo apresentação da classificação com e sem resultados.
- Chromium em 320, 360, 375, 390, 430, 768, 1024 e 1440 px: sem rolagem horizontal da página; expansão móvel e desktop funcional.
- Capturas reais em `captures/arena-publica-2026-10-23/`: `classificacao-mobile-390.png`, `classificacao-mobile-390-expandida.png`, `classificacao-desktop-1440.png` e `classificacao-desktop-1440-expandida.png`.

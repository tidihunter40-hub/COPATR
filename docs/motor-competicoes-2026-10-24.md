# TR Competition Engine — entrega local de 24/10/2026

## 1. Análise inicial

O projeto tinha um motor local de pontos corridos (`dist/engine.mjs`), com método circular, turno e returno, classificação fixa em 3–1–0 e histórico local de correções. O painel oficial já cadastrava competições, temporadas, clubes, partidas manuais e resultados no Supabase. O esquema remoto aceita `round_robin`, `knockout` e `groups_knockout`, mas não representa grupos, fases dependentes, regulamentos personalizados ou um Corujão. A página pública consulta apenas dados oficiais de partidas confirmadas. Nenhum dado remoto foi alterado nesta entrega.

## 2. Funcionalidades implementadas

- `dist/tr-competition-engine.mjs`: módulo independente da interface para validar participantes, pontuação e calendários; planejar ligas de 1 a 4 turnos, grupos e mata-mata; calcular classificação com critérios ordenáveis e confronto direto de coorte; resolver vencedores confirmados e progressão de chave; analisar, gerar e validar o Corujão; calcular horários conforme estações e intervalos.
- `/planejador`: tela pública de análise que mostra até três alternativas, totais, ressalvas, grupos e exemplos de confrontos. O Corujão aparece apenas para e-Sports. O formulário é somente leitura e não cria campeonatos.
- `/painel/campeonatos/novo`: link para o planejador e identificação explícita dos formatos cuja agenda oficial ainda depende de cadastro manual.

## 3. Motor matemático

- Pontos corridos: `N × (N − 1) ÷ 2` partidas por turno, `N − 1` rodadas para N par, N rodadas para N ímpar. Turnos alternam mando.
- Grupos: método circular por grupo; o motor exige uma regra de campeão quando uma competição termina em vários grupos.
- Mata-mata: fases corretas para potências de dois; para 12 equipes, quatro confrontos preliminares e quatro avanços diretos, somente quando autorizados explicitamente. As fases futuras guardam referências `winnerOf`; correção que alteraria uma partida posterior confirmada é bloqueada.
- Desempate: comparação de uma coorte de equipes empatadas, inclusive três ou mais, em vez de comparações isoladas entre pares. Empate eliminatório sem critério configurado não gera vencedor.
- Corujão: três rodadas com `N/2` partidas cada, `3N/2` partidas na fase inicial, uma partida por equipe por rodada, sem folgas ou adversário repetido. Grupos de três usam cruzamento entre dois grupos. A seleção exige todos os resultados confirmados e regulamento explícito; empate na última vaga é bloqueado.

## 4. Formatos disponíveis hoje

| Formato | Planejamento local | Uso no painel oficial |
| --- | --- | --- |
| Pontos corridos | Gerador e classificação testados | Temporada e partidas manuais; geração automática ainda não integrada ao banco |
| Fase de grupos | Calendário por grupo testado | Ainda sem modelo de grupo no banco |
| Grupos + mata-mata | Calendário e contagem de vagas | Rascunho e partidas manuais; sem progressão automática oficial |
| Mata-mata direto | Chave, preliminares explícitas e resolução local | Rascunho e partidas manuais; sem persistência de referências futuras |
| Corujão | Presets e validação local | Não disponível para campeonato oficial |

Eliminação dupla, sistema suíço, séries MD3/MD5 e híbridos adicionais continuam fora das opções operacionais.

## 5. Corujão

Presets testados com 8, 10, 12, 16, 18, 20, 24, 28 e 32 participantes. Quantidades ímpares entre 8 e 32 são rejeitadas. Para 14, 22, 26 e 30, a agenda é matematicamente possível, mas a recomendação é retida porque o critério de classificados ainda não foi aprovado. Os demais números pares sem preset também não são criados silenciosamente.

Com 20 equipes, o motor mostra cinco grupos de quatro, 30 partidas na primeira fase, dez por rodada e oito classificados (cinco líderes e três dos cinco segundos). A comparação entre grupos exige critérios explícitos. Se houver menos de dez estações, o estado vira **infraestrutura incompatível** com rodadas simultâneas.

## 6. Testes

`tests/competition-engine.test.mjs` cobre ligas de 4, 5, 8, 10 e 20 equipes; grupos de 3, 4 e 5; chaves de 2, 4, 8, 16 e 32; preliminar de 12; desempate múltiplo; correções de chave; Corujão de 8 a 32; classificados dos nove presets; empate na vaga final e capacidade de estações. `scripts/verify-competition-planner.mjs` testa interação e ausência de rolagem horizontal em 320, 375, 390, 430, 768 e 1440 px. Capturas em `captures/competition-planner-2026-10-24/`.

## 7. Segurança e persistência

O planejador não escreve no Supabase. O painel existente mantém Auth, RLS, RPC de resultados e auditoria. Nenhuma migration foi criada ou aplicada, e nenhuma competição, equipe ou histórico remoto foi alterado. A verificação somente de leitura do Supabase respondeu HTTP 200 com a chave publicável e certificados do sistema; isso não valida operações autenticadas.

## 8. Limitações

Esta é a fundação matemática e a experiência de análise, não a entrega integral do prompt mestre. O esquema atual não guarda regulamentos, composição de grupos, vagas, referências de vencedores, estações nem fases híbridas. O painel oficial não executa o plano do motor, e não houve teste de escrita com conta organizadora. Modalidades como vôlei, basquete e e-Sports ainda precisam de modelos de resultado e pontuação específicos. O navegador do planejador mostra exemplos de equipes, não inscrições reais.

## 9. Próximos passos

1. Criar migrations aditivas para regulamentos, fases, grupos, vagas e referências de chave, com RLS e auditoria.
2. Implementar um RPC transacional que valide e grave o plano escolhido para participantes oficiais, sem apagar partidas confirmadas.
3. Integrar homologação de classificados, pênaltis/agregado e progressão de fases no painel e na vitrine pública.
4. Validar a migration e os fluxos completos em ambiente Supabase de teste com contas de proprietário, editor, visualizador e visitante antes de habilitar formatos oficiais novos.

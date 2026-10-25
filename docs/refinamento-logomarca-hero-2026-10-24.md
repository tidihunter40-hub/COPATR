# Logomarca central do hero — refinamento de 24/10/2026

## Decisão sobre o arquivo

O hero já usa a logomarca oficial transparente [`01_logo_principal_transparente.png`](../dist/assets/official/01_logo_principal_transparente.png), de **954 × 567 px**. Não há arquivo vetorial original no projeto. A versão oficial [`05_logo_principal_alta_resolucao_com_fundo.png`](../dist/assets/official/05_logo_principal_alta_resolucao_com_fundo.png), de 1035 × 663 px, tem contornos mais limpos, mas seu fundo escuro produz um retângulo visível sobre o estádio. Uma máscara baseada na versão transparente cortou partes do símbolo e da assinatura. Essas alternativas foram rejeitadas; nenhuma logomarca foi redesenhada ou substituída.

O raster transparente preserva a identidade aprovada, porém contém brilho azul e irregularidades nas bordas **dentro dos próprios pixels**. CSS não consegue eliminar completamente esses artefatos sem afetar o desenho. Para um acabamento realmente definitivo, a marca precisará de um mestre vetorial ou de um PNG transparente original em resolução maior, com bordas limpas.

## Ajuste entregue

Em [`home-stage02.css`](../dist/home-stage02.css), a sombra azul adicional da área central foi removida; ficou apenas uma sombra escura discreta. Brilho, saturação e contraste do arquivo no hero foram moderados. A largura máxima evita ampliar a imagem além da sua resolução, inclusive em 4K, e o limite para telas de alta densidade preserva os pixels da fonte. O estádio, gramado, cards, navegação, painel e demais elementos não foram alterados nesta intervenção. O arquivo oficial permanece intacto.

## Comparação e validação

| Largura | Antes | Depois |
|---|---|---|
| Mobile 390 px, DPR 2 | [Captura](../captures/hero-logo-2026-10-24/antes-hero-390.png) | [Captura](../captures/hero-logo-2026-10-24/depois-hero-390.png) |
| Desktop 1440 px | [Captura](../captures/hero-logo-2026-10-24/antes-hero-1440.png) | [Captura](../captures/hero-logo-2026-10-24/depois-hero-1440.png) |
| Desktop 2560 px | [Captura](../captures/hero-logo-2026-10-24/antes-hero-2560.png) | [Captura](../captures/hero-logo-2026-10-24/depois-hero-2560.png) |
| Desktop 3840 px | Não capturado antes | [Captura](../captures/hero-logo-2026-10-24/depois-hero-3840.png) |

O roteiro [`hero-logo-qa.mjs`](../scripts/hero-logo-qa.mjs) mediu 390, 768, 1440, 1920, 2560 e 3840 px. Não houve rolagem horizontal, distorção de proporção nem ampliação acima da resolução do raster. No celular de 390 px com DPR 2, a fonte entrega 1,63 pixel por pixel físico exibido; em 4K a marca é limitada a 780 px, com 1,22 pixel de fonte por pixel exibido. Medidas completas: [antes](../captures/hero-logo-2026-10-24/antes-medidas.json) e [depois](../captures/hero-logo-2026-10-24/depois-medidas.json).

`npm run typecheck` passou. O build passou e `npm test` terminou com **29/29 testes aprovados**. Um teste assíncrono não relacionado ao hero falhou na primeira execução simultânea de verificações e passou isoladamente e na repetição da suíte completa.

# TR Campeonatos — evolução visual local

**Estado do modo oficial (23/10/2026):** há uma implementação local adicional de segurança, publicação, placares e portal público descrita em [docs/implementacao-painel-portal-2026-10-23.md](docs/implementacao-painel-portal-2026-10-23.md). A migration correspondente ainda não foi aplicada nem validada no Supabase remoto. As seções abaixo descrevem também o laboratório local e etapas anteriores.

Protótipo navegável com homepage responsiva, apresentação do sistema em componentes React e laboratório de pontos corridos. A identidade oficial fornecida pelo proprietário está em `dist/assets/official/`: logo principal no cabeçalho e rodapé, símbolo TR em espaços compactos, versão monocromática na apresentação do portal e ícone específico no manifesto PWA e favicon. As imagens mantêm suas proporções originais.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `dist/index.html` | Homepage, navegação e laboratório |
| `dist/styles.css` | Identidade visual responsiva |
| `dist/homepage-premium.css` | Cabeçalho, hero e faixa de recursos premium |
| `src/showcase.tsx` | Seções React, abas de apresentação, modalidades, recursos e planos |
| `dist/showcase.css` | Estilos responsivos da apresentação React e destaque do laboratório |
| `dist/identity-premium.css` | Paleta oficial e acabamento compartilhado da homepage, apresentação e laboratório |
| `dist/lab-premium.css` | Layout administrativo, configuração, partidas, classificação e portal responsivos |
| `dist/club-profile.css` | Escudos, identidade visual dos clubes e perfil responsivo |
| `dist/app.mjs` | Interações, validação de formulários e armazenamento local |
| `dist/club.mjs` | Validação de escudos e trajetória calculada das partidas |
| `dist/supabase-real-mode.mjs` | Serviços do modo real via URL e chave anônima do Supabase |
| `dist/engine.mjs` | Confrontos, resultados e classificação independentes da interface |
| `src/club-profile.tsx` | Perfil e linha do tempo interativa em React |
| `tests/engine.test.mjs` | Casos de 4, 5 e 8 equipes, returno, correções e validações |
| `tests/club.test.mjs` | Escudos e trajetória após correção de resultados |
| `supabase/migrations/` | Esquema PostgreSQL versionado, integridade, RLS, histórico e Storage |
| `.env.example` | Variáveis públicas necessárias para ativar Supabase localmente |
| `server.mjs` | Servidor estático local para prévia |

## Executar

Requer Node.js. Rode `npm install`, depois `npm start` e abra `http://127.0.0.1:45321`. `npm start` gera o bundle React antes de servir a página. Rode `npm run typecheck` e `npm test` para verificar a apresentação e o motor. Com Chrome instalado e o servidor ativo, `npm run visual:qa` confere seis larguras (320, 390, 430, 768, 1024 e 1440 px), o fluxo de resultados, correção e histórico, persistência e console. `node scripts/club-qa.mjs` verifica upload, perfil e linha do tempo em desktop e celular. Os comandos geram capturas locais.

O planejador de formatos está em `http://127.0.0.1:45321/planejador`. Ele analisa ligas, grupos, mata-mata e o Corujão de e-Sports antes do cadastro, sem gravar dados oficiais. Veja [o estado e as limitações do motor](docs/motor-competicoes-2026-10-24.md). Rode `node scripts/verify-competition-planner.mjs` para conferir a tela em seis larguras.

## Escopo desta versão

- Campeonato fictício com nome, modalidade e pontos corridos em turno único ou returno.
- Equipes: cadastrar, editar e excluir até 32 participantes, com sigla, categoria, descrição, cor de destaque e escudo opcional. Escudos PNG/JPG/WEBP são validados por assinatura e decodificação, limitados a 300 KB, 2048 × 2048 pixels e cota conjunta local.
- Perfis individuais clicáveis na classificação, partidas, portal local e apresentação React. O perfil mostra o escudo cadastrado ou placeholder identificado, temporada opcional e estatísticas calculadas dos placares.
- Linha do tempo React das rodadas geradas, com detalhes de adversários, resultados e partidas pendentes. Correções de placar atualizam a trajetória sem duplicar jogos ou gols.
- Geração circular de confrontos com folga para quantidade ímpar.
- Registro e correção de placares com histórico no navegador.
- Classificação automática com critérios fixos: pontos, vitórias, saldo, gols marcados e nome.
- Prévia local do portal público e exemplo fictício identificado.
- Prévia visual do painel na homepage, conectada aos dados locais quando disponíveis.
- Apresentação React com abas de painel, campeonatos, partidas, classificação e estatísticas; dados fictícios sinalizados quando o laboratório estiver vazio.
- Cards interativos de seis modalidades com indicação honesta das regras ainda não implementadas.
- Recursos, processo em quatro etapas, estado vazio para campeonatos públicos e três categorias de planos sem preços ou cobrança fictícia.
- Estatísticas individuais, inscrições e publicação online claramente identificadas como futuras.
- Cabeçalho, hero e faixa de recursos refeitos com equilíbrio entre preto, azul e prata.
- Laboratório, painel demonstrativo e prévias com superfícies escuras, placares e pontos destacados; a classificação móvel mostra as colunas iniciais e permite rolagem horizontal para as demais.
- Menu lateral com a logo oficial, configuração com progresso baseado nos dados existentes, confrontos com placar central e status, classificação em grafite e prévia do portal alinhada ao laboratório.
- Estado salvo em `localStorage` deste navegador. Limpar os dados do navegador remove a demonstração.

O projeto inclui a base do modo real em Supabase: migrations versionadas, RLS, bucket privado para escudos, serviços de acesso e documentação em [supabase/README.md](supabase/README.md). Como este ambiente não possui URL nem chave anônima do projeto Supabase, a conexão real não foi ativada nem declarada como testada. O laboratório continua local e fictício. Fases eliminatórias, pênaltis, prorrogação, W.O., placar agregado e campeão homologado precisam ser registrados no banco antes de aparecerem em perfis públicos.

## Próximas fases

O backend deverá validar autorização, isolamento entre organizadores, limites dos planos e todos os cálculos no servidor antes de permitir campeonatos reais. O motor atual foi isolado para facilitar essa migração. Não publicar em produção sem autorização do proprietário.

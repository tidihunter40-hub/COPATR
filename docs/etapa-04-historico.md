# Etapa 04 — histórico e dados oficiais

O esquema existente em `supabase/migrations/202610220001_sports_memory.sql` já separa a identidade do clube (`clubs`) das participações por temporada (`competition_entries`), dos jogos (`matches`), das conquistas confirmadas (`competition_titles`) e dos eventos históricos (`club_history`). As views `club_lifetime_stats` e `club_season_stats` calculam números acumulados e por edição. Nenhuma tabela nova é necessária para a experiência desta etapa.

O perfil público desta etapa lê `clubs`, `competition_entries`, `matches`, `competition_titles` e, quando permitido, `club_lifetime_stats`. A escolha de temporada busca partidas da edição selecionada. Apenas placares com status `confirmed` entram no campo como resultado oficial. As seis equipes da Copa TR E-SPORTS permanecem em um módulo de demonstração separado, sem escrita no Supabase.

## Lacuna de permissão a verificar

A migração concede leitura anônima às tabelas públicas, mas não concede explicitamente `SELECT` anônimo às views `club_lifetime_stats` e `club_season_stats`. Quando a view responder com erro de permissão, o perfil mantém participações e conquistas visíveis e apresenta `—` nos indicadores acumulados. Para disponibilizar os indicadores a visitantes, avaliar em uma migração futura, após conferir as políticas RLS das tabelas de origem:

```sql
grant select on public.club_lifetime_stats, public.club_season_stats to anon;
```

As views usam `security_invoker = true`, portanto as políticas de leitura pública das tabelas de origem continuam necessárias. Esta proposta não foi aplicada ao banco.

## Limite da demonstração local

Os dados do laboratório permanecem em `localStorage` e podem desaparecer quando o navegador for limpo. O histórico permanente depende de clubes e temporadas realmente cadastrados no Supabase. A interface não promove a Copa TR E-SPORTS a competição oficial e não atribui títulos à simulação.

with tech as (
  select id, summary,
    trim(both from regexp_replace(summary, '^Ficou por tratar:\s*', '')) as raw
  from public.miscellaneous_items
  where summary ilike 'Ficou por tratar%'
),
mapped as (
  select id, raw,
    case
      when raw ~* '(act sem ferramenta|no_tool)' then 'Não consegui executar este pedido — falta-me essa capacidade ainda.'
      when raw ~* '(indispon|service_down|rate.?limit|timeout|HTTP 4|HTTP 5|429|503)' then 'Não consegui responder na altura por indisponibilidade temporária.'
      when raw ~* '(not_found|invalid_args|tool_failed|error|_rls|falha)' or raw like '%:%' then 'Percebi o pedido, mas não consegui concluir a ação.'
      else 'Guardei aqui para não se perder — diz-me o que fazer com isto.'
    end as pt
  from tech
)
update public.miscellaneous_items m
set summary = mapped.pt,
    tags = (select array_agg(distinct t) from unnest(m.tags || array['tec:' || left(mapped.raw, 180)]) as t)
from mapped
where m.id = mapped.id;
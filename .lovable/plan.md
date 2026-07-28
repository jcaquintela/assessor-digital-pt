# Plano — Alinhar v3 à Constituição, adicionar Proatividade e AQS

Três frentes em paralelo, entregues no mesmo turno. Item 4 (rebatismo Alfred) fica de fora conforme pedido.

## 1. Auditoria v3 vs Constituição — e correcções imediatas

Reler o motor v3 com a lente "um excelente assessor humano faria isto?" e corrigir fugas culturais no código, não em documentos.

Alvos concretos:
- `src/lib/assessor/v3/prompts.ts`: reforçar que o modelo nunca menciona "acção", "intent", "payload", "tool", "estado", "id", "backend"; nunca começa por "Feito"; nunca pede confirmação com linguagem de formulário ("Confirmas os seguintes campos: ...").
- `src/lib/assessor/v3/reasoning-engine.server.ts` (orquestrador): passar toda a `natural_reply` pelo `culture/sanitize.ts` (já existente) e pelo `culture/short-answers.ts` para garantir 1-2 frases, PT-PT, tratamento por "tu", contracções ("ao Paulo", "à Maria"), e substituir aberturas tipo "Registei/Guardei/Feito" pré-execução por confirmações só depois de `ACT` devolver sucesso.
- `decide.server.ts`: quando `action = "ask"`, garantir uma só pergunta por turno (rejeitar respostas com mais do que um "?"); quando `action = "act"` mas o `ACT` falha, gerar reply humana de recuperação em vez de silêncio.
- Vocabulário: bloquear no pós-processamento palavras proibidas (regex) e substituí-las por versões humanas quando escaparem do modelo.

## 2. Ciclo Proativo — o Assessor fala primeiro

Job periódico que gera *nudges* profissionais quando faz sentido, respeitando a regra de ouro.

- Nova tabela `assessor_nudges` (id, user_id, kind, subject_type, subject_id, reason, suggested_reply, status: pending|sent|dismissed|acted, scheduled_for, created_at, sent_at). GRANTs + RLS por `user_id`.
- Novo módulo `src/lib/assessor/v3/proactivity.server.ts` com regras determinísticas iniciais:
  - Pessoa sem interacção há ≥ 21 dias e com oportunidade aberta → sugerir contacto.
  - Imóvel com estado activo mas sem documentos essenciais (caderneta / CPU / certificado energético) há ≥ 7 dias → sugerir pedido ao proprietário.
  - Follow-up vencido há > 2 dias e não concluído → sugerir reagendar ou fechar.
  - Silêncio total do consultor há ≥ 3 dias úteis → nudge leve de bom-dia com resumo.
- Cada nudge escreve `suggested_reply` já sanitizada pelo `culture/sanitize.ts`.
- Rota pública `src/routes/api/public/hooks/proactive-tick.ts` (aut. via `apikey` anon key) que corre a geração e o envio via `whatsapp/send.server.ts` para consultores com número ligado e flag v3 activa.
- Cron `pg_cron` a cada 30 min chamando a rota (via `supabase--insert`).
- Rate limit dentro do gerador: máx 3 nudges por consultor por dia, nunca fora de 09:00–20:00 Europe/Lisbon, nunca sábado à noite/domingo.

## 3. Assistant Quality Score (AQS)

Capturar por turno 4 sinais 0/1 e um score agregado.

- Nova tabela `assessor_quality_scores` (id, user_id, channel, trace_id → `assessor_reasoning_traces.id`, understood_first_try, reformulated, executed_successfully, human_tone, score numeric, notes text, created_at). GRANTs + RLS.
- Cálculo automático no fim de cada turno v3 no `reasoning-engine.server.ts`:
  - `understood_first_try` = decisão ≠ `ask` no primeiro turno da sequência (usar `conversation_states.last_intent` para detectar reformulação).
  - `reformulated` = turno seguido de outro em < 60s do mesmo user no mesmo canal.
  - `executed_successfully` = todos os `toolResults.ok === true` quando `action = "act"`; N/A ⇒ 1 quando `action ∈ {acknowledge, do_nothing}`.
  - `human_tone` = passa nas heurísticas de `culture/sanitize.ts` (sem vocabulário técnico, ≤ 2 frases, tratamento por "tu").
  - `score = média dos sinais aplicáveis`.
- Painel Admin: nova página `src/routes/admin/qualidade.tsx` com:
  - AQS diário (linha), últimos 14 dias.
  - Distribuição dos 4 sinais.
  - Últimos 20 turnos com score < 0.75 (drill-down para o trace).
- Link adicionado ao menu do admin.

## Detalhes técnicos

- Migrações via `supabase--migration` (com GRANTs). Cron via `supabase--insert`.
- Nenhuma alteração ao v2 nem ao v1; tudo está atrás da flag `assessor.engine.v3` já activa só para o Júlio, portanto testável em produção sem risco para outros.
- Sem novos secrets: usa `LOVABLE_API_KEY`, `WHATSAPP_*` e `SUPABASE_*` já existentes.
- Testes: adicionar `src/lib/assessor/v3/proactivity.test.ts` (regras determinísticas) e `src/lib/assessor/v3/quality.test.ts` (cálculo dos 4 sinais). Sem UI E2E nesta iteração.
- Kill switch: `DELETE FROM feature_flag_users WHERE flag_key='assessor.engine.v3'` desliga tudo (motor, nudges v3-only, AQS).

## Fora do âmbito
- Rebatismo Alfred (item 4).
- Nudges gerados por IA (só regras determinísticas nesta fase).
- Dashboards de AQS fora do /admin.

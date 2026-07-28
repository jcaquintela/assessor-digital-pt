# Trust Mode v1 — Plano de implementação

Objectivo: transformar o AQS num sistema de confiança (ATS) que sabe onde falha, aprende com correções do consultor e bloqueia regressões antes de expandir.

Faseado em 4 releases para não colocar tudo online de uma vez. Motor v3 continua atrás da flag `assessor.engine.v3` (só Júlio).

---

## Fase 1 — Fundação de dados (migração única)

Novas tabelas + colunas, com RLS e GRANT:

- `assistant_user_corrections`
  - `conversation_id` (external_conversation_id), `turn_id` (uuid → `assessor_reasoning_traces.id`), `category` (enum: `wrong_person`, `wrong_property`, `wrong_date`, `wrong_document`, `lost_context`, `unnatural_reply`, `unnecessary_question`, `wrong_execution`, `other`), `original_message`, `correction_message`, `final_result`, `resolved bool`, `user_id`, timestamps.
- `assistant_trust_scores` (por turno, agregável)
  - `trace_id` FK, `task_success 0|1|null`, `aqs_score numeric`, `corrections_count int`, `context_preservation 0..1`, `safe_decisions 0..1`, `ats numeric` (0..100), timestamps.
- `assistant_reflections`
  - `trace_id` FK, `trigger` (`low_aqs` | `low_ats` | `user_correction`), `analysis jsonb` (porquê falhei, o que faltou, resposta ideal), `model`, timestamps. Nunca exposto ao consultor.
- `assistant_golden_conversations`
  - `id`, `slug`, `title`, `turns jsonb` (mensagens + expectativas por turno), `tags text[]`, `active bool`.
- `assistant_golden_runs`
  - `golden_id` FK, `release_ref` (git sha/timestamp), `passed bool`, `ats numeric`, `aqs numeric`, `task_success numeric`, `diffs jsonb`, `created_at`.
- `assistant_shadow_runs`
  - `trace_id` FK (produção), `strategy text` (nome da variante), `reply text`, `ats`, `aqs`, `task_success`, `latency_ms`, `created_at`. Nunca envia ao consultor.

RLS: tudo bloqueado ao consultor; só admins leem. Escrita apenas via service role dentro de handlers.

## Fase 2 — Cálculo do ATS

`src/lib/assessor/v3/trust.server.ts`:
- `computeTaskSuccess(trace, toolResults)` — 1 se decisão `act` teve todas as tools ok e o recurso persistiu (re-select), 0 se falhou, null para `acknowledge`/`ask`.
- `computeContextPreservation(trace, history)` — heurística determinística: penaliza se DECIDE fez `ask` sobre campo já presente no `conversation_state` ou historial recente; se criou duplicado (mesmo `dedupe_key`); se referiu entidade errada vs `active_person_id`/`last_property_id`.
- `computeSafeDecisions(trace, toolResults, reply)` — 1 por defeito; 0 se resposta afirmou sucesso sem tool_calls ok, se prometeu ação futura não agendada, ou se sanitize teve de reescrever "Feito".
- `computeATS({task, aqs, corrections, context, safe})` com pesos 35/25/15/15/10.

Integrar no fim de `reasoning-engine.server.ts` a seguir ao AQS; gravar em `assistant_trust_scores`.

## Fase 3 — Captura de correções

Detector local no `reasoning-engine`: quando a mensagem do consultor no turno N segue < 90 s um turno assistente e contém padrões de correção (`não é`, `errado`, `queria dizer`, `esse não`, `não era o/a`, `não hoje`, `mudei`, `apaga`, `cancela`), classifica com pequeno prompt no `openai/gpt-5.6-sol` (categoria fechada) e insere em `assistant_user_corrections` ligando ao `trace_id` anterior. Usa `resolved=false`; passa a `true` quando o turno seguinte terminar com sucesso na mesma entidade.

Reflection Engine: sempre que `AQS<80` OU `ATS<85` OU nova correção, dispara `reflect(trace, correction?)` (Lovable AI, prompt em PT-PT com 5 perguntas do brief) e grava em `assistant_reflections`. Assíncrono, sem bloquear a resposta ao consultor.

## Fase 4 — Painel `/admin/qualidade` (extensão)

Novos cartões:
- ATS diário (14 dias) + breakdown por pilar.
- Top 10 motivos de falha: agrega `assistant_user_corrections.category` + heurísticas do trust score (ask desnecessária, contexto perdido, duplicado, execução errada, resposta pouco natural). Percentagens.
- Últimas 20 correções + reflexão associada (colapsável).
- Barra "Definição de Pronto" com semáforos: ATS≥90, AQS≥90, TaskSuccess≥95%, Corrections<3%, Duplicados<1%, PerdaContexto<2%, Golden sem regressão.

Server fns em `quality.functions.ts` (extensão).

## Fase 5 — Golden Conversations + Shadow Mode (arquitetura, sem UI de execução ainda)

- Seed inicial de ~30 golden conversations em `supabase/migrations` (JSON) cobrindo: criar seguimento, criar contacto, associar documento, consulta de agenda, referência ambígua, negação, correção de data.
- CLI `bun run golden:check` (script em `scripts/golden-check.ts`) que corre cada golden contra `runReasoningEngine` com um user fake e compara ATS/AQS/TaskSuccess com o último `assistant_golden_runs`. Falha se regride. Documentado em `docs/golden-conversations.md`.
- Shadow Mode: em `reasoning-engine.server.ts`, se flag `assessor.engine.v3.shadow` estiver on para o utilizador, corre `runShadowStrategy(trace)` em `waitUntil`-style (fire-and-forget) que executa uma segunda `decide()` com prompt/variante alternativa e grava em `assistant_shadow_runs`. Nunca responde ao consultor.

---

## Detalhes técnicos

- Todas as escritas passam pela camada de domínio já existente — IA nunca escreve directamente.
- Tabelas novas: `GRANT ALL ... TO service_role` + `GRANT SELECT` a `authenticated` só onde admins precisam ler via `is_admin`.
- Prompts do Reflection Engine e Shadow Mode isolados em `src/lib/assessor/v3/prompts.ts` para versionamento.
- Toda a lógica de correção/reflexão é assíncrona e não pode atrasar a resposta ao consultor (>200 ms extra é bloqueador).
- Kill switch por flag continua a valer; ATS respeita a mesma flag do v3.

## Fora de âmbito desta iteração

- UI para os consultores verem correções (é interno).
- Auto-substituição da estratégia produtiva pela shadow (só recolha comparativa).
- Golden Conversations >30 (subimos para 200 depois de validar formato).
- Alterações ao motor v2/legacy.

Se aprovares, começo pela Fase 1 (migração) e Fase 2 (cálculo ATS + integração no engine) neste turno; Fases 3–5 na sequência.

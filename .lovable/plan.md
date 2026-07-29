# Assessor Supremo v1 — Plano de entrega

Alinhado com a Constituição e o pedido (secção 20): apresento primeiro o diagnóstico + desenho, e proponho implementar nesta iteração apenas o subconjunto MVP (briefing manhã, priorização, outcomes, autonomia de lembretes, dashboard "Hoje", KPIs Closed Loop / Proactive Usefulness). Tudo por trás da flag `assessor.supreme.v1`, activa só para o Júlio.

## 1. Diagnóstico do que já existe

**Motor v3 (`src/lib/assessor/v3/`)** — Reasoning Engine (Observe→Think→Search→Decide→Act→Remember→Reply), Trust Mode (ATS, corrections, reflections), AQS, Golden Conversations, Shadow Mode, sanitize, feature flags. Não mexer na estrutura.

**Proatividade actual (`proactivity.server.ts` + cron `api/public/hooks/proactive-tick`, 30 min)** — já gera nudges para silêncio de clientes e follow-ups vencidos, com dedupe_key em `assessor_nudges`. Base sólida para expandir para Daily Loop.

**Domínio já modelado:** `follow_ups` (com status, priority, due_date, due_time, timezone), `interactions`, `opportunities` (next_action, next_action_date, probability), `properties`, `people`, `miscellaneous_items`, `routines` (materializa recorrências), `calendar_connections` (schema pronto, sem Google/Outlook ligados).

**Dashboard `/hoje`** — actualmente lê do `useStore` (dados locais/demo mistos). Precisa passar a ler dados reais via server fn.

**Gaps face ao pedido:**
- Sem motor de prioridade explícito (score + razões).
- Sem `outcome` estruturado nos follow_ups (só `status`).
- Sem preferências de autonomia por tipo de acção.
- Sem origem/confiança/staleness nas informações-chave.
- Sem KPIs Closed Loop / Proactive Usefulness / Suggestion Acceptance.
- Cron único de 30 min; não há janelas horárias por utilizador (briefing manhã, quiet hours).

## 2. Componentes reutilizáveis

- `reasoning-engine.server.ts` — orquestrador central; adiciona-se contexto de prioridades ao SEARCH.
- `proactivity.server.ts` + `assessor_nudges` — extender com novos `kind` (`daily_briefing`, `pre_event`, `outcome_check`, `daily_wrap`, `stale_info`).
- `quality.server.ts` + `/admin/qualidade` — adicionar novas métricas ao mesmo painel.
- `send.server.ts` (WhatsApp) — canal já pronto para enviar nudges.
- `feature-flag.server.ts` (v3) — clonar padrão para `assessor.supreme.v1`.
- Golden Conversations infra — adicionar novos casos (secção 17).

## 3. Novas tabelas / colunas

Migrações (sempre com GRANT + RLS por `auth.uid()`):

```
-- Preferências operacionais e de autonomia
CREATE TABLE consultant_preferences (
  user_id uuid PK,
  morning_briefing_enabled bool, morning_time time, morning_days int[],
  evening_wrap_enabled bool, evening_time time,
  quiet_hours_start time, quiet_hours_end time, timezone text,
  primary_channel text,               -- 'whatsapp' | 'app'
  max_daily_nudges int default 6,
  autonomy_level text default 'balanced', -- conservador|equilibrado|proativo
  updated_at timestamptz
);

CREATE TABLE autonomy_rules (
  user_id uuid, action_type text,     -- 'create_reminder', 'save_note', 'merge_person', ...
  requires_confirmation bool,
  updated_at timestamptz,
  PRIMARY KEY (user_id, action_type)
);

-- Prioridades calculadas (materializadas por job para "As minhas prioridades")
CREATE TABLE daily_priorities (
  id uuid PK, user_id uuid, subject_type text, subject_id uuid,
  action text, reason text[], priority_score numeric,
  due_at timestamptz, calculated_at timestamptz,
  dismissed_at timestamptz, completed_at timestamptz
);

-- Outcome tracking
ALTER TABLE follow_ups
  ADD outcome text,                   -- concluído|não_realizado|adiado|sem_resposta|precisa_nova_ação|cancelado
  ADD outcome_notes text,
  ADD outcome_recorded_at timestamptz,
  ADD next_action_created_id uuid;

-- Origem/confiança nas entidades-chave (properties, opportunities, people)
-- coluna JSONB `field_provenance` por tabela:
--   { price: {source, source_id, confidence, confirmed_at, last_verified_at, stale_after} }
ALTER TABLE properties     ADD field_provenance jsonb default '{}';
ALTER TABLE opportunities  ADD field_provenance jsonb default '{}';
ALTER TABLE people         ADD field_provenance jsonb default '{}';

-- Feedback implícito sobre nudges
ALTER TABLE assessor_nudges
  ADD outcome text,                   -- accepted|dismissed|ignored|snoozed|stop_topic
  ADD outcome_at timestamptz,
  ADD urgency text default 'useful';  -- urgent|important|useful|info
```

Nova flag em `feature_flags`: `assessor.supreme.v1` (só Júlio via `feature_flag_users`).

## 4. Novos Domain Services (server fns determinísticos)

`get_daily_priorities`, `get_pre_event_brief`, `save_event_outcome`, `save_follow_up_outcome`, `propose_next_action`, `create_next_action`, `get_stale_information`, `confirm_information`, `calculate_priorities` (job), `get_daily_summary`, `update_autonomy_preference`, `update_working_preference`. Todas validam `user_id`, respeitam RLS, auditam, e nunca respondem "Feito" antes do sucesso real.

## 5. Alterações no orchestrator

- **Feature-flag gate**: `isSupremeEnabled(userId)` decide se se activa o Supreme; caso contrário, comportamento actual mantém-se.
- **SEARCH**: injecta top-3 prioridades + outcomes pendentes + info stale relevante ao contexto activo.
- **DECIDE**: prompt reforçado para (a) referir prioridade real ao responder "por onde começo?", (b) perguntar outcome quando compromisso já terminou sem resultado, (c) confirmar info stale antes de reutilizar.
- **ACT**: consulta `autonomy_rules` antes de executar; se `requires_confirmation=false` para o `action_type`, executa sem confirmação; caso contrário mantém pending_action.
- **REMEMBER**: qualquer escrita passa `source_type` + `confidence` para `field_provenance`.

## 6. Daily Operating Loop

Substituir o cron único por um "tick" que corre a cada 15 min e, por utilizador com Supreme activo:

```
tick(now):
  for user in supreme_users:
    prefs = consultant_preferences(user)
    if within(prefs.morning_time, ±10min) and today in morning_days:
        emit nudge 'daily_briefing'  (usa get_daily_priorities)
    for event in events_starting_in(user, 45–75min):
        emit nudge 'pre_event'       (usa get_pre_event_brief)
    for event in events_ended_between(30–90min ago) without outcome:
        emit nudge 'outcome_check'
    if within(prefs.evening_time, ±10min):
        emit nudge 'daily_wrap'      (usa get_daily_summary)
    stale = get_stale_information(user, limit=1)
    if stale and cooldown_ok: emit nudge 'stale_info'
```

Cada `emit` respeita: quiet hours, `max_daily_nudges`, cooldown por assunto, dedupe_key, urgência (só urgent+important vão a WhatsApp por defeito).

## 7. Política de autonomia

Três presets (conservador/equilibrado/proativo) que apenas semeiam `autonomy_rules`; o consultor pode override por `action_type`. Whitelist executável sem confirmação limita-se ao definido na secção 7 (notas, interacções, Diversos, associação de ficheiros inequívocos, concluir tarefa quando explícito, criar lembretes, updates não sensíveis). Blacklist absoluta (merge, preço, proprietário, delete, cancelar compromissos, mensagens a clientes, financeiro) exige sempre confirmação — não é configurável para além disso.

## 8. Modelo de prioridade

`priority_score = clamp(0..100, w1·urgency + w2·commitment + w3·value_potential + w4·decision_proximity − w5·recency_penalty)` calculado por `calculate_priorities` (job de 15 min ou on-demand). Cada componente devolve também uma `reason` legível → gravada em `priority_reasons text[]`. O DECIDE recebe as top-N com razões, para poder verbalizar em PT-PT ("Começaria pelo Paulo — está em atraso desde ontem e a oportunidade continua activa").

## 9. Riscos

- **Excesso de notificações no WhatsApp** → limites por dia + quiet hours + urgência.
- **Prioridades erradas** → razões visíveis + feedback implícito (dismiss/snooze) alimenta ajuste; Priority Accuracy no painel.
- **Autonomia mal configurada a executar acções sensíveis** → blacklist fixa, testes Golden dedicados, kill switch.
- **Info stale usada como facto** → provenance obriga a confirmar antes de reutilizar em respostas.
- **Regressão do motor v3** → tudo por trás da flag; sem flag, código antigo intacto; Golden Conversations correm nas duas variantes.

## 10. Rollout

Etapa 1 (esta entrega): só Júlio, 7 dias mínimos, com métricas Closed Loop Rate, Proactive Usefulness, Suggestion Acceptance, Autonomy Error Rate a aparecerem em `/admin/qualidade`. Etapas 2–4 conforme secção 19 do pedido, sempre com gates ATS ≥90, AQS ≥90, Task Success ≥95%, Closed Loop ≥80%, Autonomy Error =0.

---

## Escopo desta iteração (após aprovação)

1. Migração: `feature_flags` (`assessor.supreme.v1`), `consultant_preferences`, `autonomy_rules`, `daily_priorities`, colunas de outcome em `follow_ups`, colunas `urgency`/`outcome` em `assessor_nudges`.
2. Domain services: `get_daily_priorities`, `calculate_priorities`, `get_pre_event_brief`, `save_follow_up_outcome`, `save_event_outcome`, `update_autonomy_preference`.
3. Extensão do `proactive-tick`: briefing manhã, pré-evento, outcome-check (por trás da flag).
4. Orchestrator: gate + injecção de prioridades no SEARCH + consulta a `autonomy_rules` no ACT (só para `create_reminder` nesta iteração).
5. `/hoje`: novos blocos "As minhas prioridades", "Aguardam resultado", "Riscos", ligados a dados reais via server fn (mantém dashboard actual quando flag off).
6. Definições: secção "Autonomia do meu Assessor" (preset + toggle lembretes) e horas de briefing.
7. `/admin/qualidade`: cartões Closed Loop Rate e Proactive Usefulness Rate.
8. Golden Conversations novos: manhã, prioridade, pré-evento, outcome, autonomia lembretes, "não me voltes a lembrar".
9. Testes Vitest para prioridade, outcomes e autonomia.

Fora deste primeiro corte (fases seguintes): personalização observada, Google/Outlook, staleness detection completa, evening wrap, next-best-action em `/pessoas` e `/imoveis`, todos os KPIs restantes.

Confirmas que avanço com este escopo mínimo?

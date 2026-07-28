
# Router semântico central com IA

Objetivo: substituir o routing rígido baseado em regex pela interpretação de IA em todas as mensagens com conteúdo profissional ou conversacional. As regras determinísticas ficam apenas nos pontos onde a correção depende de garantia (segurança, confirmação, execução, idempotência, validação, sanitização).

## Estratégia

- **Interpretação (IA)**: intenção, domínio, referências ("dono desse imóvel", "o outro"), correção, continuação, confiança, campos em falta, ato conversacional.
- **Execução (determinística)**: confirmações "sim/não", `handleSlotFill`, INSERT/UPDATE com re-SELECT, idempotência via `source_pending_action_id`, sanitização cultural, validação de datas.
- **Resposta (mista)**: formulada depois de obter dados reais da BD; nunca "Feito" antes de o backend confirmar.

## O que mantém regex (não mexer)

`short-answers.ts` (sim/não/ok/obrigado), `state-machine.ts`, `date-resolver.ts`, `culture/sanitize.ts`, extractores de imóveis (`properties.server.ts`), idempotência do INSERT em `engine.server.ts`, verificação de permissões e RLS.

## O que passa a ser IA

Todo o restante routing atual em `engine.server.ts`: `QUERY_AGENDA_RE`, `QUERY_MISC_RE`, `ACTION_VERB_RE`, `OWNER_REF_RE`, `MORE_RE`, `looksLikeCorrection`, `handleActivePropertyEnrichment`, e o dispatch de intenções via `ai.server.ts`.

## Fases

### Fase 1 — Router semântico (`interpretAssessorMessage`)
- Novo módulo `src/lib/assessor/router.server.ts`.
- Migração de `google/gemini-3.6-flash` (default) via **Lovable AI Gateway** (substitui a dependência atual de `OPENAI_API_KEY` em `ai.server.ts`).
- Structured output com `Output.object` (Zod), sem `.min()/.max()` no schema. Schema exato do brief (§4): `conversation_act`, `intent`, `destination`, `is_new_topic`, `is_continuation`, `is_correction`, `requires_database_lookup`, `requires_confirmation`, `should_persist`, `confidence`, `references`, `entities`, `missing_fields`, `reply_intent`.
- Entrada: mensagem, nome consultor, nome Assessor, timezone, ação pendente (compacta), última pergunta, entidade ativa, 6 últimas mensagens, resumo factual. Sem histórico bruto contaminante.
- System prompt com glossário imobiliário (§6): angariação, CPU, CRP, caderneta, CE, escritura, reserva, proposta, comissão, partilha, etc.

### Fase 2 — Integração no motor
- `engine.server.ts` refatorado para:
  1. Pre-flight determinístico: sanidade de input, confirmação/cancelamento a pending, slot-fill, fluxo de ficheiros. (mantido)
  2. **Chamar `interpretAssessorMessage`** para tudo o resto.
  3. Dispatch pelo resultado estruturado (`intent`/`destination`), não por regex.
  4. Se `requires_database_lookup=true` → consulta real (agenda, pessoa, imóvel, ficheiro) e devolve resposta natural formulada com esses dados.
  5. Se `requires_confirmation=true` → cria `pending_action` com título descritivo determinístico (via `buildDescriptiveTitle`).
  6. Se `missing_fields.length > 0` → pergunta curta contextual (§11), não "não percebi".
  7. Se `confidence < 0.55` E há ambiguidade → pergunta de desambiguação com base em entidades ativas.
- Remoção de `QUERY_AGENDA_RE`, `QUERY_MISC_RE`, `MORE_RE`, `looksLikeCorrection` do dispatch (mantidos como *safety nets* de fallback só se IA falhar).

### Fase 3 — Resolução de referências
- Nova função `resolveReferences(refs, ctx)` em `router.server.ts`:
  - "dono/proprietário desse imóvel" → `properties.owner_person_id` da entidade ativa.
  - "esse T3", "aquele apartamento" → entidade ativa (`conversation_states.active_topic`).
  - "o outro", "a outra" → última entidade do mesmo tipo em `pending_actions` recentes.
  - Se referência não resolve → adiciona a `missing_fields` para forçar pergunta curta.

### Fase 4 — Observabilidade e custo (§12, §13)
- Nova tabela `assessor_ai_calls` (user_id, channel, model, intent, domain, confidence, tokens_in, tokens_out, latency_ms, fallback_used, run_id, created_at). RLS: só o próprio user + admins via `has_role`. GRANTs para authenticated/service_role.
- Logs estruturados: `logBranch("router_ai", { intent, domain, confidence, route })`.

### Fase 5 — Testes de naturalidade
- Nova suite `src/lib/assessor/router.test.ts` com mocks do gateway.
- 12 variações do §14. Cada frase produz `intent`/`destination` esperado.
- Testes de regressão para os 96 atuais (todos devem passar).
- Teste "não contamina": conversa antiga sobre Paulo + nova mensagem sobre Ana não trocam entidades.

## Escopo desta plan

- Substituir OpenAI por Lovable AI Gateway (Gemini). O user usa `gpt-5-nano` no brief, mas indicações internas apontam `google/gemini-3.6-flash` como default e mais barato/rápido. Se preferires manter GPT, uso `openai/gpt-5-nano` via mesmo gateway.
- Preservar todos os fluxos existentes (WhatsApp webhook, /assessor, ficheiros). Zero alterações de schema para além de `assessor_ai_calls`.
- Zero mudanças de UI.

## Fora de escopo

- Streaming (chat continua request/response).
- Novo modelo de embeddings/RAG.
- Alterações a `properties.server.ts`, `whatsapp/*`, `admin/*`.

## Riscos e mitigação

- **Latência** (IA em cada mensagem): usar Gemini Flash, cap `max_tokens: 300`, prompt compacto. Estimativa: 400-800ms extra por turno.
- **Alucinação de entidades**: IA nunca cria recursos. Só devolve `references` e `entities`; execução usa apenas dados reais. Sanitização final continua obrigatória.
- **Custo**: métricas por user em `assessor_ai_calls` + alerta no admin (fase futura).
- **Falha de IA (429/402/5xx)**: fallback determinístico para o routing atual (mantido como camada 2).

## Detalhes técnicos

**Modelo**: `google/gemini-3.6-flash` (default Lovable AI). Zero chaves para o utilizador.
**SDK**: `ai` + `@ai-sdk/openai-compatible`. Provider helper em `src/lib/ai-gateway.server.ts`.
**Schema**: Zod plano, sem bounds. Guard com `NoObjectGeneratedError.isInstance` + fallback parse.
**Persistência de contexto**: reutiliza `conversation_states` e `pending_actions` existentes.

## Verificação

1. `bunx vitest run` — todos os 96 + novos verdes.
2. Playwright: enviar 4 mensagens variantes do §14 em `/assessor`, capturar respostas, comparar com esperado.
3. Consulta manual em produção do log `assessor_ai_calls` para 20 turnos: confiança média, latência p95, custo estimado.

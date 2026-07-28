# Reasoning Engine — Plano de Implementação

Este plano operacionaliza o manifesto: substituir o motor v2 (tool-calling reativo) por um Reasoning Engine em 5 fases, onde a IA raciocina com hipóteses e confiança, e o backend executa. Nada é implementado até aprovares.

## Princípios não-negociáveis

- A IA nunca escreve na BD. Só o backend, via Domain Services já existentes (`src/lib/assessor/v2/domain.server.ts`).
- Nunca dizer "Feito" antes de confirmação do backend.
- Sem regex de intenção. Sem enum `intent`. Trabalhamos com hipóteses + confiança.
- Conversa é o centro. Dashboard é a memória organizada dela.
- Rollout apenas para `julio.quintela@saguii.com` via nova flag `assessor.engine.v3`. v2 continua vivo para todos os outros.

## Arquitetura

```text
mensagem
   ↓
[1 OBSERVE]   extrai sinais crus (telefone, morada, doc, verbo, valor, data, tom)
   ↓         ← determinístico, sem IA
[2 THINK]     IA #1: gera hipóteses {label, confidence, reasoning}
   ↓
[3 SEARCH]    backend: corre as pesquisas que as hipóteses pedem
   ↓         (people/properties/agenda/uploaded_files/conversation_state)
[4 DECIDE]    IA #2: recebe observações+hipóteses+resultados+memória
   ↓         devolve {action, tool_calls[], natural_reply, memory_writes[]}
[5 ACT]       backend: executa tool_calls via Domain Services,
              confirma sucesso, aplica memory_writes, envia reply
```

Duas chamadas de IA por turno em vez de um loop de tool-calling. Cada uma com output estruturado; ambas passam sempre pelo Domain layer para tocar dados.

## Ficheiros novos (`src/lib/assessor/v3/`)

- `observe.server.ts` — extração determinística de sinais (regex + heurísticas simples). Sem decisões.
- `think.server.ts` — chamada de IA #1 (Gemini 3.6 flash via gateway), devolve hipóteses + memory_value + pesquisas recomendadas.
- `search.server.ts` — executa as pesquisas pedidas (reutiliza executors do v2: `search_people`, `search_properties`, `search_agenda`, uploaded_files por telefone/hash, conversation_state ativo).
- `decide.server.ts` — chamada de IA #2 com contexto completo, devolve plano de ação estruturado.
- `act.server.ts` — executa tool_calls via `TOOL_REGISTRY` v2, verifica sucesso com re-select, escreve memória.
- `memory.server.ts` — 4 níveis (imediata/operacional/estratégica/permanente) mapeados para `conversation_states`, `pending_actions`, `interactions`, `people.summary`/`properties.notes`.
- `reasoning-engine.server.ts` — orquestrador que liga as 5 fases.
- `prompts.ts` — os dois system prompts (THINK e DECIDE) com o vocabulário imobiliário PT (angariação, CPU, CRP, caderneta, placa, exclusive, etc.).
- `types.ts` — `Observation`, `Hypothesis`, `SearchResult`, `Decision`, `MemoryWrite`.

## Ficheiros a reaproveitar (sem alteração)

- `src/lib/assessor/v2/domain.server.ts` — executores. São a única porta para a BD.
- `src/lib/assessor/v2/tools.ts` — schemas Zod continuam a validar tudo.
- `src/lib/assessor/v2/gateway.server.ts` — cliente do Lovable AI Gateway.
- `src/lib/assessor/culture/*` — sanitize, contrações, closers sociais. A IA propõe, o sanitize garante.
- `src/lib/assessor/agenda.ts` — cálculos Europe/Lisbon.

## Gate no engine central

`src/lib/assessor/engine.server.ts`: gate por flag antes do v2.

```text
if (userFlag('assessor.engine.v3')) → reasoning-engine
else if (userFlag('assessor.engine.v2')) → orchestratorV2
else → v1 legacy
```

Kill switch: apagar linha em `feature_flag_users` (efeito imediato, sem redeploy).

## Base de dados

Migração única com:

- `assessor_reasoning_traces` — 1 linha por turno v3: `observations jsonb`, `hypotheses jsonb`, `searches jsonb`, `decision jsonb`, `tool_calls jsonb`, `latency_ms`, `success`, `user_id`, `channel`, `created_at`. RLS: só o próprio + service_role. Permite auditar cada raciocínio sem poluir `assessor_ai_logs`.
- Nova feature flag `assessor.engine.v3` em `feature_flags` (global off).

`conversation_states` e `pending_actions` já suportam o que precisamos — nenhuma alteração de schema.

## Contrato dos outputs da IA

**THINK** devolve estritamente:
```json
{
  "observations": [{"type":"phone|address|document|amount|date|name|verb|tone|reference","value":"..."}],
  "hypotheses": [{"label":"novo_contacto_de_placa","confidence":0.89,"reasoning":"..."}],
  "memory_value": "none|temporary|permanent|strategic|emotional",
  "recommended_searches": ["people_by_phone","properties_by_location","conversation_state"]
}
```

**DECIDE** devolve estritamente:
```json
{
  "confidence": 0.0,
  "action": "act|ask|search_more|acknowledge|do_nothing",
  "tool_calls": [{"name":"create_person","arguments":{...}}],
  "memory_writes": [{"scope":"operational","key":"last_property_id","value":"..."}],
  "natural_reply": "..."
}
```

Regras de confiança (aplicadas no backend, não na IA):

- ≥0.90 → executa e confirma
- 0.70–0.89 → executa se acção é reversível, senão pergunta uma coisa
- 0.40–0.69 → propõe e pede confirmação
- <0.40 → só pergunta, sem tocar em dados

## Segurança / integridade

- Zod valida cada tool_call antes de tocar em `TOOL_REGISTRY`.
- Após cada INSERT, re-SELECT para confirmar antes do reply (regra já herdada do v2).
- Se qualquer tool falhar, `natural_reply` é substituído por mensagem honesta ("Não consegui guardar isso agora, tenta outra vez?").
- Sanitize final passa pelas regras de cultura (PT-PT, tratamento por tu, sem termos técnicos).

## Testes

- `observe.test.ts` — cada tipo de sinal isolado.
- `reasoning-engine.test.ts` — 3 cenários end-to-end com IA mockada:
  1. "932345789 placa Madalena Praias" → pergunta antes de criar
  2. "CPU Moradia Boavista" (doc anexo) → propõe criar imóvel + associar
  3. "sim" após proposta pendente → executa e confirma
- Suite existente (culture, agenda, follow-ups) continua verde.

## Rollout

1. Migração + feature flag global off.
2. Publicar código com v3 desligado.
3. `INSERT` em `feature_flag_users` apenas para Júlio.
4. 24-48h de observação em `assessor_reasoning_traces`.
5. Se estável, decidir alargar; se não, remover linha da flag.

## Estimativa

- Fase A — scaffold v3 + observe + memory (2h)
- Fase B — THINK + prompts + gateway wiring (2h)
- Fase C — SEARCH + DECIDE + ACT + gate (3h)
- Fase D — migração `assessor_reasoning_traces` + telemetria (1h)
- Fase E — testes + smoke + rollout Júlio (2h)

Total: ~10h de trabalho, entregável hoje se aprovares.

## Fora deste plano (fase seguinte)

- Repensar dashboard como "memória da conversa" (rotas continuam iguais nesta fase).
- Integração Google Calendar / Outlook.
- Migrar restantes utilizadores de v2 para v3.

## Riscos

- Duas chamadas de IA por turno ≈ 2× custo por mensagem. Aceitável no piloto (1 utilizador). Mitigação futura: fundir THINK+DECIDE quando confiança inicial for muito alta.
- Latência: alvo <4s p50. Se ultrapassar, cachar SEARCH em memória de turno.
- IA pode devolver JSON inválido — fallback: usar `natural_reply` bruto sem tool_calls, nunca crashar o turno.

## Recomendação

Go. O v2 já provou que tool-calling reativo não chega — o motor tem de raciocinar antes de agir. Este redesenho é a única forma de honrar o manifesto sem virar isto num CRM disfarçado.

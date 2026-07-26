
# Correção estrutural do estado conversacional

Suspendo novas funcionalidades. Reescrevo o núcleo do motor para eliminar a mistura de ações, respostas curtas ambíguas e datas inválidas. O trabalho é feito em ordem, com testes no fim.

## Fase 0 — Limpeza do estado atual (dados)

Antes de qualquer código novo, corro um script de diagnóstico + limpeza contra a base de dados para o utilizador afetado (identificado por telefone/email a confirmar) e para todos os utilizadores em piloto:

1. `pending_actions`: marcar como `cancelled` todas as linhas cujo estado seja `pending_confirmation`, `collecting_information` ou `correction_pending` e `updated_at < now() - interval '1 hour'`, com `error_message='reset estrutural'`.
2. `conversation_states`: limpar `pending_action_id`, `active_topic`, `state_summary` sempre que `pending_action_id` já não aponte para uma linha ativa.
3. `follow_ups`: identificar duplicados via `(user_id, title, due_date, due_time)` com `count > 1` criados no mesmo minuto — reter o mais antigo, marcar os restantes com `notes` a indicar duplicado e `status='cancelled'` (não apagar).
4. `assessor_messages`: **não tocar**.
5. Relatório impresso: nº de pending cancelados, states limpos, seguimentos deduplicados, por utilizador.

Entregue como server function admin-only `cleanupAssessorState` + relatório no chat.

## Fase 1 — Máquina de estados determinística

Novo módulo `src/lib/assessor/state-machine.ts`:

- Enum `ConversationStatus`: `idle | collecting_information | awaiting_confirmation | awaiting_correction | executing | completed | cancelled | failed`.
- Enum `ExpectedAnswerType`: `none | confirmation | date | time | datetime | person | property | free_text | correction`.
- Alterações à tabela `pending_actions` (migração):
  - `current_question_type text`
  - `expected_answer_type text`
  - `question_asked_at timestamptz`
  - índice único parcial: `UNIQUE (user_id, channel) WHERE status IN ('pending_confirmation','collecting_information','correction_pending')` para garantir **uma ação ativa por canal**.
- Função `route(message, state, pending)` que devolve uma de: `CONFIRM | REJECT | FILL_SLOT | CORRECT | NEW_INTENT | QUERY_AGENDA | SMALLTALK | UNKNOWN`.

## Fase 2 — Parser determinístico de respostas curtas

`src/lib/assessor/short-answers.ts`:

- `parseConfirmation(text)`: sim/confirma/regista/pode ser/ok/claro/força → só devolve `true` se `expected_answer_type === 'confirmation'`. "ok" nunca confirma fora desse estado.
- `parseRefusal(text)`: não/cancela/esquece/deixa/nem.
- `parseDateOnly(text)` e `parseTimeOnly(text)`: reutilizam `date-resolver.ts`, restritos a mensagens curtas (< 40 chars) sem verbos de ação.
- Utilizados **antes** da IA quando `state !== 'idle'`.

## Fase 3 — Reescrita de `processAssessorMessage`

Fluxo novo, curto, com early returns por estado:

```
1. Carregar state + pending ativo
2. Se pending existir:
     a. Se expected=confirmation → parseConfirmation/Refusal
     b. Se expected=date → parseDateOnly, preencher slot, revalidar
     c. Se expected=time → parseTimeOnly
     d. Se expected=person/property → resolver contra BD
     e. Se slot preenchido e sem faltas → mudar para awaiting_confirmation e reformular pergunta
     f. Se utilizador inicia claramente nova intenção → responder
        "Tenho ainda uma tarefa por confirmar. Concluir ou ignorar?"
        (não criar nova em paralelo)
3. Se não há pending:
     a. Detectar query_agenda apenas com padrões explícitos
        ("o que tenho hoje", "agenda", "compromissos", "que dia é hoje")
        — nunca com "amanhã" isolado
     b. Detectar correção da última ação executada (janela 30 min)
     c. Caso contrário → IA extrai intent + entidades → criar pending
4. Após execução/cancelamento: limpar pending_action_id, current_question,
   voltar a idle.
```

## Fase 4 — Validação de dados

- `assertValidDate(iso)` central: rejeita null/undefined/NaN/Invalid Date.
- `formatWhen`/`naturalWhen` já protegidas — reforçar com testes.
- Renderização de cartões: nunca mostrar "essa tarefa" — se título vazio, usar `intent`+entidade principal ou pedir clarificação.
- Guardar `resource_fingerprint = hash(intent + entities normalizados)` em `pending_actions` para dedupe.

## Fase 5 — Idempotência de execução

Antes de criar `follow_ups`/eventos:

- Verificar se já existe `follow_up` com `pending_action_id = pending.id` → devolver o existente.
- Verificar fingerprint nos últimos 5 min → recusar duplicado.

## Fase 6 — Contexto enviado à IA

Reduzir prompt de contexto a:

- mensagem atual;
- pending atual (intent + entidades + slot em falta);
- última pergunta do Assessor;
- entidade ativa em `conversation_state`;
- últimas 4 mensagens (`role`, `content`), independentemente do estado anterior.

Remover envio de ações executadas antigas.

## Fase 7 — Testes

Suite Vitest `src/lib/assessor/__tests__/state-machine.test.ts` cobrindo os 15 casos exigidos, com stubs da BD e da IA. Cada teste corre `processAssessorMessage` mockando `supabase` e verificando pending/state finais + resposta.

## Fase 8 — Correção após execução

Janela 30 min sobre `last_created_resource_id`. Padrões: "é às Xh, não às Yh", "afinal é...", "não, muda...". Atualiza a mesma linha, responde "Tens razão. Corrigi para...".

## Detalhes técnicos

- Migração SQL só ADICIONA colunas + índice parcial; não remove nada.
- `engine.server.ts` fica como orquestrador fino (~400 linhas); toda a lógica nova em módulos separados testáveis.
- Fast-path parsers correm **antes** de qualquer chamada à IA quando há pending.
- `conversation_states` passa a ter `status`, `expected_answer_type` derivados via join à pending activa — não duplicar em ambos.

## Fora do âmbito

- Sem novas features (WhatsApp/imóveis/rotinas).
- Sem alterações à UI para além de cartões que passem a mostrar "—" em vez de "Invalid Date".

## Ordem de entrega

1. Migração + script de limpeza + relatório
2. State machine + short-answers + testes unitários destes módulos
3. Reescrita do orquestrador
4. Suite dos 15 cenários
5. Verificação com `bunx vitest run` e typecheck

Peço confirmação antes de arrancar, sobretudo para (a) identificar o utilizador afetado a limpar e (b) confirmar que posso relaxar o índice único a **um pending por canal** (bloqueia paralelismo por design).

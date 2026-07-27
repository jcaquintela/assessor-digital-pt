
# Reconstruir a cultura central do Assessor

Substituo o núcleo conversacional para cumprir os 27 princípios: conversa natural PT-PT, memória estruturada, uma ação ativa, respostas curtas determinísticas, nunca inventar, dashboard como memória clicável.

## Fase 0 — Reset do estado atual

Server function admin `resetAssessorCulture` (executada uma vez):

- `pending_actions`: cancelar todas as linhas em `pending_confirmation | collecting_information | correction_pending` com `updated_at > 1h` — motivo `"reset cultural"`.
- `conversation_states`: limpar `pending_action_id`, `active_topic`, `state_summary`, `last_intent` quando o pending referenciado já não está ativo.
- `properties`: renomear `"Imóvel por classificar"` quando existir menção posterior explícita a um nome (via última mensagem do consultor no mesmo dia).
- `follow_ups`: desativar duplicados criados no mesmo minuto (mesmo `user_id + title + due_date`).
- `assessor_messages`: intacto.

Relatório no chat com contagens por tabela.

## Fase 1 — Módulos centrais novos

Criar módulos pequenos, testáveis, independentes do canal:

```
src/lib/assessor/
  culture/
    identity.ts          nome do Assessor, vocativo, forma de tratamento
    smalltalk.ts         saudações, agradecimentos, casual → não persiste
    short-answers.ts     confirma/recusa/data/hora/correção determinísticos
    state-machine.ts     enum ConversationStatus + transições
    validators.ts        assertValidDate, assertNoTechLeak, sanitizeReply
    reply-templates.ts   frases naturais PT-PT (nunca "proposta", "essa tarefa")
    context-loader.ts    memória mínima: pending + últimas 4 msg + entidade ativa
```

## Fase 2 — Reescrita do orquestrador `engine.server.ts`

Pipeline determinístico (ordem obrigatória da secção 9):

```text
1. Identificar utilizador + canal + preferências (nome do Assessor)
2. stripVocative(msg, assessorName)
3. Se smalltalk → responder natural, não persistir, sair
4. Carregar pending ativo + conversation_state
5. Se pending existe:
     - parseConfirmation → executar
     - parseRefusal → cancelar
     - parseCorrection → atualizar mesma linha
     - parseSlotFill (data/hora/pessoa/imóvel) → preencher
     - se nova intenção clara → "Tenho ainda X por confirmar. Concluir ou ignorar?"
6. Se não há pending:
     - detectar query_agenda (padrões estritos)
     - detectar correção do último recurso (janela 30min)
     - senão: IA extrai intent + entidades → criar pending
7. Validar saída (sanitizeReply) antes de responder
8. Ao concluir/cancelar: limpar pending_action_id, current_question → idle
```

Regras invioláveis:
- nunca chamar IA para respostas < 40 chars quando há pending;
- nunca preencher campos ausentes com "último conhecido";
- nunca mostrar "proposta", "intent", "essa tarefa", "Invalid Date".

## Fase 3 — Contrato de IA

Endurecer `ai.server.ts`:

- Modelo `google/gemini-3.6-flash` (default Lovable AI, sem chave externa).
- JSON schema exato da secção 24: `intent, destination, confidence, requires_confirmation, is_continuation, is_correction, is_casual, entities, missing_fields, reply`.
- Prompt curto com: nome do Assessor, tratamento, últimas 4 msg, pending atual, entidade ativa. Nada mais.
- `reply` da IA é sugestão — passa por `sanitizeReply` antes de sair.
- Se `confidence < 0.5` ou `intent === "unknown"` → resposta padrão "Não percebi bem essa parte. Podes explicar de outra forma?" (uma única variante, natural).

## Fase 4 — Respostas naturais

`reply-templates.ts` centraliza todas as frases visíveis:

- confirmação pendente: `"{quando} tens {o quê}. Queres que registe?"`
- executado: `"Feito."` / `"Feito. {resumo curto}."`
- correção aceite: `"Tens razão. Corrigi para {novo}."`
- data desconhecida: `"Não percebi bem a data. Para que dia é?"`
- ficheiro recebido: `"Recebi {tipo}. A que se refere?"`

Formatação de datas via `naturalWhen()` — "amanhã às 10h", "sexta às 15h", nunca ISO.

## Fase 5 — Imóveis e classificação invisível

- Ao criar imóvel sem nome explícito: guardar como rascunho oculto (`status='por_angariar'`), pedir contexto naturalmente. Nunca gravar título `"Imóvel por classificar"`.
- Enriquecimento progressivo: enquanto `conversation_state.last_property_id` estiver ativo (< 15min), novas frases atualizam a mesma ficha.
- Distinguir localização vs pessoa via lista de freguesias/localidades PT + verbos ("dono do imóvel em X" → X é localização).

## Fase 6 — Testes de aceitação (secção 26)

Suite Vitest `culture.test.ts` que mocka Supabase + IA e corre os 6 cenários exigidos:

1. Saudação com nome personalizado
2. Visita simples + sim
3. Correção de hora
4. Ficheiro CPU + criação de imóvel
5. Lembrete contextual (localização, não pessoa)
6. Nota fora do padrão → Diversos + sugestão de seguimento

Cada teste verifica: resposta textual, ausência de leaks técnicos, estado final da BD (pending, follow_up, property, misc), e transição para `idle`.

## Fora do âmbito

- Sem alterações à UI do dashboard além de garantir que fichas continuam clicáveis.
- Sem novos módulos (Google Calendar/Outlook ficam com stubs; secção 20 é preparatória).
- Sem alterações a WhatsApp inbound/outbound além do reuso do motor.

## Ordem de entrega

1. Reset (Fase 0) — executo primeiro e reporto números.
2. Módulos culture/* + testes unitários.
3. Reescrita do engine + ai.server.
4. Enriquecimento imóveis + templates.
5. Suite de aceitação + `bunx vitest run` + typecheck.

## Confirmações antes de arrancar

- Confirmas que posso executar já o **reset** (Fase 0) em todos os utilizadores (produção inclusiva)?
- Confirmas o modelo **`google/gemini-3.6-flash`** via Lovable AI (sem `OPENAI_API_KEY`) — ou preferes manter OpenAI `gpt-5-nano` como no texto?
- O trabalho vai tocar em ~15 ficheiros e demora várias iterações — queres que entregue tudo de uma vez ou fase-a-fase com validação tua entre cada?

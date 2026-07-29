
# Channel Gateway — WhatsApp e Telegram como transportes do mesmo motor

## Estado atual (o que já cumpre o princípio)

Ambos os webhooks já delegam ao mesmo pipeline: `processAssessorMessage` em `src/lib/assessor/engine.server.ts`, com o motor v3, pending_actions, conversation_states, reminders, prospecting, Drive, people, properties, agenda, corrections e sanitize. Já existe:

- `src/lib/assessor/channels.server.ts` — `findUserIdByChannel`, `linkChannelToUser`, `sendReplyForChannel` (WhatsApp+Telegram).
- Tabela `channel_links` como fonte única de verdade da resolução por canal.
- `processIncomingFile` partilhado (mesmo bucket, mesma classificação).
- Reasoning Engine v3, ferramentas, memória e reminders indiferentes ao canal.

O que **falta**: os dois webhooks ainda contêm lógica de negócio duplicada (normalização, dedupe, dispatch por tipo, media handling, reply-and-store, transcrição). É essa camada que vamos extrair — sem tocar no motor.

## 1. Código WhatsApp a extrair para o Channel Gateway

De `src/routes/api/public/whatsapp-webhook.ts`:

- `handleEvent` / `handleMessage` — dispatch por `type` e dedupe.
- `handleMediaMessage` — download, `processIncomingFile`, transcrição, re-entrada no motor.
- Blocos `interactive`/`button` — extração de título/payload e re-injecção como texto.
- `replyAndStore` — envio + persistência do turno do assistente com telemetria.
- Persistência inicial da mensagem `role: "user"` (hoje é ad-hoc em cada ramo).

O que **NÃO** se extrai (fica no webhook WhatsApp): verificação HMAC (Meta), `GET` challenge, `tryLinkCode` (LIGAR-XXXXXX é específico WhatsApp), `bumpAttempts`.

## 2. Interfaces comuns

Novo módulo `src/lib/assessor/channel-gateway/`:

```text
channel-gateway/
├── types.ts               NormalizedInbound, ChannelAdapter, AdapterReply
├── adapter.ts             registry: getAdapter(channel)
├── whatsapp-adapter.ts    implementa ChannelAdapter para WhatsApp
├── telegram-adapter.ts    implementa ChannelAdapter para Telegram
├── ingest.server.ts       runInboundPipeline(normalized) — o ÚNICO ponto de entrada
├── media.server.ts        handleInboundMedia(normalized, adapter)
└── reply.server.ts        deliverReply(userId, channel, externalId, outcome)
```

`NormalizedInbound` (produzido pelos adapters, consumido pela pipeline):

```ts
type NormalizedInbound = {
  channel: "whatsapp" | "telegram";
  externalConversationId: string;   // wa phone ou chat_id
  externalMessageId: string;         // wamid ou telegram_${update_id}
  messageType: "text" | "image" | "document" | "audio" | "contact" | "location" | "callback" | "unsupported";
  text: string | null;
  media?: { externalFileId: string; fileName: string | null; mimeType: string; size: number; bytes: Uint8Array } | null;
  callback?: { data: string } | null;
  metadata: Record<string, unknown>; // caption, replyTo, from, etc.
  receivedAt: Date;
};
```

`ChannelAdapter`:

```ts
interface ChannelAdapter {
  channel: "whatsapp" | "telegram";
  // Transporte
  sendText(externalId: string, text: string, opts?: { replyTo?: string | null }): Promise<{ ok: boolean; messageId?: string | null; telemetry?: unknown }>;
  sendOptions(externalId: string, prompt: string, options: Array<{ id: string; label: string }>): Promise<{ ok: boolean }>;
  sendFile?(externalId: string, file: { bytes: Uint8Array; mimeType: string; fileName?: string }, caption?: string): Promise<{ ok: boolean }>;
  getFile(externalFileId: string): Promise<{ ok: boolean; bytes?: Uint8Array; mimeType?: string; fileName?: string | null }>;
  answerInteraction?(interactionId: string, feedback?: string): Promise<void>;
  formatResponse(text: string): string; // hoje é identity; hook para markdown/HTML se necessário
  // Persistência do turno do utilizador (dedupe/log)
  persistInbound(supabaseAdmin: any, n: NormalizedInbound, userId: string | null): Promise<string | null>; // devolve UUID
}
```

## 3. Adapter WhatsApp

`whatsapp-adapter.ts` encapsula:

- Envio via `sendWhatsAppText` (mantém telemetria e `kind: "auto"`).
- `getFile` = `downloadWhatsAppMedia(mediaId)`.
- `persistInbound` = insert em `assessor_messages` com `whatsapp_message_id = wamid` (dedupe existente preservado).
- `sendOptions` mapeia para `interactive.button` (até 3 botões) ou fallback para texto numerado.
- `formatResponse` = identity.

O parser de payload Meta (`entry[].changes[].value.messages[]`, `interactive.button_reply`, `list_reply`, `image/document/audio/voice`) vive em `whatsapp-adapter.ts::parseUpdate(rawJson): NormalizedInbound[]`.

## 4. Adapter Telegram

`telegram-adapter.ts` encapsula:

- Envio via `TelegramProvider.sendText` / `answerCallback`.
- `getFile` = `provider.getFile` + `provider.downloadFile`.
- `persistInbound` reutiliza a chave `telegram_${update_id}` no campo `whatsapp_message_id` até introduzirmos coluna dedicada (nota abaixo).
- `sendOptions` mapeia para inline keyboard (`callback_data = option.id`).
- `parseUpdate(update): NormalizedInbound[]` extrai texto/foto/documento/voice/audio e `callback_query`.

Mantém o fluxo actual de convite (`claimInvite`) mas isolado em `telegram-adapter.ts::onboardIfMissingUser(normalized)`, chamado ANTES da `runInboundPipeline` quando `findUserIdByChannel` devolve `null`. O onboarding fica só no adapter porque o convite é específico do canal.

## 5. Pipeline comum

`runInboundPipeline(normalized, adapter, supabaseAdmin)`:

```text
1. userId = findUserIdByChannel(channel, externalConversationId)
2. persistedMsgUuid = adapter.persistInbound(normalized, userId)   // idempotente via unique key
3. Se !userId:
     → adapter.onboardIfMissingUser?(normalized) — fluxo próprio do canal.
     → Se nada: adapter.sendText(REPLY_UNASSOCIATED). Fim.
4. Se messageType === "unsupported" → adapter.sendText(REPLY_UNSUPPORTED). Fim.
5. Se messageType === "callback":
     content = normalized.callback.data      // token opaco ou label
     → processAssessorMessage({ userId, channel, content, sourceMessageId: null })
     → adapter.answerInteraction(interactionId)  (se aplicável)
     → deliverReply(...)
6. Se messageType in {image, document, audio}:
     → handleInboundMedia(normalized, adapter, userId, persistedMsgUuid)
       (usa processIncomingFile; se audio → transcribeAudio → re-entra em processAssessorMessage)
7. Se messageType === "text":
     → processAssessorMessage({ userId, channel, content: text, sourceMessageId: persistedMsgUuid })
     → deliverReply(...)
```

`deliverReply` respeita a convenção existente: quando `outcome.messageType === "__ALREADY_PERSISTED__"`, apenas envia (motor já persistiu); caso contrário, envia + insere `role: "assistant"` com telemetria.

## 6. Mudanças mínimas nos webhooks

`src/routes/api/public/whatsapp-webhook.ts` (≈570 → ≈120 linhas):

```ts
POST: async ({ request }) => {
  if (!verifyHmac(...)) return 401;
  const payload = JSON.parse(raw);
  const adapter = getAdapter("whatsapp");
  const inbounds = adapter.parseUpdate(payload);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (const n of inbounds) {
    // Fast-path LIGAR-XXXXXX antes da pipeline (fluxo legado só WhatsApp)
    if (isLinkCode(n)) { await handleLinkCode(...); continue; }
    await runInboundPipeline(n, adapter, supabaseAdmin);
  }
  return new Response("OK");
}
```

`src/routes/api/public/telegram/webhook.ts` (≈366 → ≈70 linhas):

```ts
POST: async ({ request }) => {
  if (!verifyTelegramSecret(...)) return 401;
  const update = await request.json();
  const adapter = getAdapter("telegram");
  const inbounds = adapter.parseUpdate(update);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (const n of inbounds) await runInboundPipeline(n, adapter, supabaseAdmin);
  return Response.json({ ok: true });
}
```

Nenhuma referência directa a `sendWhatsAppText`, `getTelegramProvider`, `downloadWhatsAppMedia`, `processIncomingFile`, `processAssessorMessage` nos ficheiros de webhook — tudo passa pelo adapter/pipeline.

## 7. Testes de equivalência

Novo `src/lib/assessor/channel-gateway/equivalence.test.ts` com fake adapters em memória e Supabase mockado (padrão dos testes v3 existentes). Cada cenário é um `it.each([["whatsapp"], ["telegram"]])`:

Cenários: saudação, criar seguimento, confirmar ("sim"), corrigir hora, reagendar reminder, consultar agenda, criar pessoa, criar imóvel, registar placa, PDF, áudio (mock de transcribe), resposta curta, botão/callback, reminder proativo (via `dispatchDueFollowUpReminders` + `primary_channel`), isolamento (dois userIds distintos, mesmo texto, não vazam registos).

Assert por cenário: o **resultado de domínio** (rows criadas em `follow_ups`/`reminders`/`prospecting_leads`/etc.) é idêntico entre canais; só variam `external_message_id` e a forma da resposta (texto vs botões). Alvo: ~15 cenários × 2 canais.

## 8. Notas técnicas

- **Coluna dedupe**: hoje `assessor_messages.whatsapp_message_id` é reutilizada para Telegram (`telegram_${update_id}`). Fica registado como dívida técnica; migração para `external_message_id` (+ backfill) é separada e não bloqueia esta refactor.
- **Mensagens proativas**: `sendReplyForChannel` já existe; passa a ser o único ponto usado por `dispatchDueFollowUpReminders`, `proactivity.server.ts` e briefings, escolhendo canal por `profiles.primary_channel` com fallback ao outro canal linkado em `channel_links`.
- **Sem alterações de schema** nesta refactor.
- **Sem alterações no motor v3, prompts, tools, memory, corrections, quality, golden**.
- Não se cria `TelegramEngine`, `TelegramPrompt`, `TelegramTools`, `TelegramMemory` — o pedido explicita que não existem.

## 9. Ordem de execução

1. Criar `channel-gateway/types.ts` + `adapter.ts` (registry).
2. Criar `whatsapp-adapter.ts` (mover `parseUpdate`, media download, send + telemetria).
3. Criar `telegram-adapter.ts` (mover `parseUpdate`, `getFile`/`downloadFile`, send, callback, onboarding por convite).
4. Criar `ingest.server.ts` + `media.server.ts` + `reply.server.ts` (pipeline única).
5. Reescrever os dois ficheiros de webhook para o esqueleto mínimo (~70–120 linhas cada).
6. Adicionar `equivalence.test.ts` parametrizado e correr `bunx vitest run`.
7. Smoke test manual: enviar "Placa Santa Maria da Feira 932145678 apartamento" em ambos os canais e confirmar que o `prospecting_leads` criado é equivalente.

## Critério de aceitação

- Os webhooks não contêm nenhuma chamada directa a `processAssessorMessage`, `processIncomingFile`, `transcribeAudio`, `sendWhatsAppText`, `getTelegramProvider` — tudo passa por `runInboundPipeline` / `ChannelAdapter`.
- Zero regressões nas suites existentes.
- Testes de equivalência verdes em ambos os canais.
- Diferenças entre WhatsApp e Telegram no repo restringem-se a `whatsapp-adapter.ts` e `telegram-adapter.ts`.

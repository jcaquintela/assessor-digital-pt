# Telegram — onboarding por convite com shadow accounts

Nota: a tua mensagem ficou truncada a meio do bloco `TelegramProvider` (após `downloadFile`). Presumo que os pontos seguintes descreviam: convites (tabela + fluxo), shadow accounts em Supabase Auth, saudação de onboarding, botões inline (reminders) e allow-list. Se algum detalhe posterior for diferente, corrige-me antes de eu implementar.

## Objetivo

Adicionar o canal Telegram ao Assessor mantendo motor v3, isolamento por `user_id`, arquitetura actual e WhatsApp intactos. Bot **só por convite** no piloto.

## Arquitetura

```text
Telegram → webhook /api/public/telegram/webhook
  → verificar secret_token (derivado de TELEGRAM_API_KEY)
  → normalizar update em CanonicalIncomingMessage
  → resolveUserIdByChannel({channel:'telegram', chat_id})
     ├─ existe link  → user_id
     └─ não existe   → fluxo de convite / recusa
  → processAssessorMessage(user_id, channel:'telegram', content, ...)  [motor v3 já existente]
  → TelegramProvider.sendText / sendOptions
```

O motor v3 (`reasoning-engine.server.ts`) já é agnóstico ao canal — só precisa de `channel` e `userId`. Nada de lógica de negócio no webhook.

## Base de dados (uma migration)

1. **`channel_links`** — mapa canónico canal↔user_id (substitui a lógica ad-hoc `profiles.phone` a longo prazo; WhatsApp continua a funcionar pelo caminho actual em paralelo).
   - `id`, `user_id → auth.users`, `channel text` (`whatsapp`|`telegram`), `external_id text` (chat_id ou msisdn), `display_name`, `linked_at`, `unique(channel, external_id)`.
2. **`telegram_invites`** — convites emitidos pelo super_admin.
   - `code text pk` (ex.: `AFONSO-7X2K`), `created_by`, `plan_tier text default 'free'`, `note`, `expires_at`, `used_by user_id null`, `used_at`, `used_chat_id`.
3. **`profiles`** — adicionar `plan_tier text not null default 'free'` e `primary_channel text not null default 'whatsapp'`.
4. **`consultant_preferences`** — já tem `autonomy_level`; garantir default `'conservative'` para contas novas via shadow.
5. GRANTs + RLS (`auth.uid() = user_id`) em `channel_links`; `telegram_invites` só acessível a `is_admin(auth.uid())`.

## Shadow accounts

Novo utilizador chega ao bot com código válido → criar via `supabaseAdmin.auth.admin.createUser({ email: \`tg-${chat_id}@shadow.assessor.local\`, email_confirm: true, user_metadata: { source: 'telegram_shadow', chat_id } })`. O trigger `handle_new_user` já cria `profiles` + `user_roles('consultant')`. Depois marcar convite como usado e inserir `channel_links`.

O utilizador pode mais tarde reclamar a conta ligando email real (fora do âmbito desta tarefa — deixar TODO documentado).

## Provider abstracto

`src/lib/telegram/provider.server.ts` — interface `TelegramProvider` (a que enviaste) + implementação `LovableConnectorTelegramProvider` que usa o connector Lovable via `connector-gateway.lovable.dev/telegram` com `LOVABLE_API_KEY` + `TELEGRAM_API_KEY`. Todo o webhook e motor consomem só a interface — trocar de provider no futuro é uma linha.

## Webhook

`src/routes/api/public/telegram/webhook.ts`:

- deriva `secret_token = sha256('telegram-webhook:'+TELEGRAM_API_KEY).base64url`, valida `X-Telegram-Bot-Api-Secret-Token` em `timingSafeEqual`;
- extrai `message` / `edited_message` / `callback_query`;
- idempotência por `update_id` (upsert numa nova `telegram_updates` mínima, ou reutilizar `assessor_messages.whatsapp_message_id` renomeando o índice? — proposta: adicionar coluna `external_update_id` a `assessor_messages` reutilizada por canal; a migration inclui isso);
- fluxo utilizador:
  - `channel_links` tem match → `processAssessorMessage`;
  - sem match e texto = código de convite válido → cria shadow account, liga, responde saudação de onboarding + exemplo da placa;
  - sem match e sem código → resposta curta: "Este bot é privado. Precisas de um código de convite.";
- media (photo/document/voice): `provider.getFile` + `downloadFile` → passa para `handleIncomingFile` existente (mesmo pipeline do WhatsApp);
- `callback_query` (botões): mapeia para o mesmo handler das buttons do WhatsApp (adiar reminder, etc.) e chama `answerCallback`.

## Motor & Serviços partilhados

- Extrair `findUserIdByChannel(channel, externalId)` para `src/lib/assessor/channels.server.ts` e usar tanto no webhook WhatsApp como no Telegram.
- `sendReplyForChannel(user, channel, text)` — despacha para `sendWhatsAppText` ou `TelegramProvider.sendText` conforme `channel`.
- `reminders.server.ts` `dispatchDueFollowUpReminders` passa a olhar `primary_channel` do consultor.

## Admin (piloto por convite)

Nova página `/admin/convites`:
- listar `telegram_invites` (código, usado por, quando);
- botão "Gerar convite" → cria código legível + `expires_at = now()+30d` + `plan_tier`;
- copiar link `https://t.me/<bot>?start=<code>` (o webhook trata `/start <code>` como resgate).

## Autonomia conservadora

Shadow accounts recém-criadas → `consultant_preferences.autonomy_level = 'conservative'` (pede confirmação para tudo excepto leitura). Já existente, só garantir default no INSERT inicial.

## Secrets

- `TELEGRAM_API_KEY` — via connector Lovable (`standard_connectors--connect` com `connector_id: telegram`). Peço-te para autorizar quando chegar a esse ponto — não avanço sem.
- `LOVABLE_API_KEY` já existe.

## Registo do webhook

Depois do route estar deployado, corro `setWebhook` via gateway (do sandbox) apontando para `https://project--<id>-dev.lovable.app/api/public/telegram/webhook` com o `secret_token` derivado. `allowed_updates: ["message","edited_message","callback_query"]`.

## Testes

- `src/lib/telegram/provider.test.ts` — mock de fetch, verifica shape das chamadas ao gateway.
- `src/lib/assessor/channels.test.ts` — resolve utilizador por canal, cria shadow com convite, rejeita sem convite.
- Idempotência `update_id`.

## Não incluído nesta tarefa

- Reclamar shadow account com email real (TODO).
- Tornar bot público.
- UI de gestão de canais no dashboard do consultor.

---

## Ordem de execução

1. Migration (tabelas + colunas + RLS + GRANTs).
2. `provider.server.ts` + testes.
3. `channels.server.ts` (resolveUserIdByChannel + sendReplyForChannel).
4. Webhook `/api/public/telegram/webhook`.
5. Refactor mínimo do webhook WhatsApp para usar `channels.server.ts` (sem alterar comportamento).
6. Página admin `/admin/convites`.
7. Pedir connect do connector Telegram, registar `setWebhook`, smoke test com convite real.

Confirmas para avançar? Em particular: (a) o resto do bloco truncado da tua mensagem não muda nada acima; (b) autorizas criar shadow accounts com email sintético `tg-<chat_id>@shadow.assessor.local`.
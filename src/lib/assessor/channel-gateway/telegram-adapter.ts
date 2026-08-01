// Adapter Telegram para o Channel Gateway.
// Responsável por: parsing de Update, dedupe, persistência, download de
// media, envio via TelegramProvider e onboarding por convite (shadow
// account). Não contém lógica de negócio do motor.

import { getTelegramProvider } from "@/lib/telegram/provider.server";
import { resolveInteractiveReply } from "@/lib/assessor/interactive";
import { linkChannelToUser } from "@/lib/assessor/channels.server";
import type {
  AdapterMediaBytes,
  AdapterSendResult,
  ChannelAdapter,
  NormalizedInbound,
  NormalizedMessageType,
} from "./types";

// Apresentação curta usada nas portas com código (equipa, planos pagos).
// O registo normal (Nível 0 grátis) é automático e não passa por aqui.
const INTRO_2_LINHAS =
  "Sou o teu assessor digital para o dia a dia imobiliário: organizo pessoas, imóveis, agenda e prospeção a partir do que me escreves.\n" +
  "Para este acesso preciso de um código — envia-o no formato /start <código> ou apenas o código.";
const REPLY_INVITE_INVALID = `${INTRO_2_LINHAS}\n\nNão reconheci esse código. Confirma-o com quem to enviou.`;
const REPLY_INVITE_EXPIRED = `${INTRO_2_LINHAS}\n\nEsse convite já expirou. Pede um novo à equipa.`;
const REPLY_INVITE_USED = `${INTRO_2_LINHAS}\n\nEsse convite já foi resgatado por outra conta.`;
const REPLY_ENGINE_ERROR = "Recebi a tua mensagem mas não consegui processá-la agora. Tenta daqui a pouco.";
const REPLY_UNSUPPORTED = "Ainda não sei processar este tipo de conteúdo aqui.";
const REPLY_MEDIA_ERROR = "Recebi o teu ficheiro mas não consegui descarregá-lo. Tenta reenviar.";
const REPLY_TRANSCRIBE_FAIL =
  "Recebi o áudio mas não consegui transcrevê-lo. Guardei em Drive.";
const REPLY_ONBOARDING = (name: string) =>
  `Olá${name ? ` ${name}` : ""}! Sou o teu Assessor. Falamos por aqui como se fosse WhatsApp — dizes-me em linguagem natural e eu organizo pessoas, imóveis, agenda e prospeção.\n\nExperimenta: "Placa Santa Maria da Feira junto ao Castelo, 932145678 Apartamento"`;

function extractInviteCode(text: string): string | null {
  const trimmed = text.trim();
  const startMatch = trimmed.match(/^\/start(?:@\w+)?\s+([A-Z0-9-]{4,32})$/i);
  if (startMatch) return startMatch[1].toUpperCase();
  const bare = trimmed.match(/^[A-Z0-9]{3,10}-[A-Z0-9]{3,10}$/i);
  if (bare) return trimmed.toUpperCase();
  return null;
}

function detectMessageType(msg: any): {
  kind: NormalizedMessageType;
  raw: string;
} {
  if (typeof msg?.text === "string") return { kind: "text", raw: "text" };
  if (msg?.photo) return { kind: "image", raw: "photo" };
  if (msg?.document) return { kind: "document", raw: "document" };
  if (msg?.voice) return { kind: "audio", raw: "voice" };
  if (msg?.audio) return { kind: "audio", raw: "audio" };
  if (msg?.video) return { kind: "unsupported", raw: "video" };
  if (msg?.sticker) return { kind: "unsupported", raw: "sticker" };
  if (msg?.location) return { kind: "unsupported", raw: "location" };
  if (msg?.contact) return { kind: "unsupported", raw: "contact" };
  return { kind: "unsupported", raw: "unknown" };
}

function fileIdFor(msg: any, raw: string): { fileId?: string; fileName?: string | null } {
  if (raw === "photo") {
    const arr = msg?.photo as any[] | undefined;
    return { fileId: arr?.[arr.length - 1]?.file_id, fileName: null };
  }
  if (raw === "document") return { fileId: msg?.document?.file_id, fileName: msg?.document?.file_name ?? null };
  if (raw === "voice") return { fileId: msg?.voice?.file_id, fileName: null };
  if (raw === "audio") return { fileId: msg?.audio?.file_id, fileName: msg?.audio?.file_name ?? null };
  return {};
}

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    pdf: "application/pdf", oga: "audio/ogg", ogg: "audio/ogg", mp3: "audio/mpeg",
    m4a: "audio/mp4", mp4: "video/mp4",
  };
  return map[ext] ?? "application/octet-stream";
}

export const telegramAdapter: ChannelAdapter = {
  channel: "telegram",
  replyUnassociated: REPLY_ENGINE_ERROR,
  replyUnsupported: REPLY_UNSUPPORTED,
  replyEngineError: REPLY_ENGINE_ERROR,
  replyMediaError: REPLY_MEDIA_ERROR,
  replyTranscribeFail: REPLY_TRANSCRIBE_FAIL,

  parseUpdate(rawPayload: unknown): NormalizedInbound[] {
    const update = rawPayload as any;
    if (!update || typeof update.update_id !== "number") return [];

    // Callback query (botão inline).
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id ? String(cq.message.chat.id) : null;
      const rawData = typeof cq?.data === "string" ? cq.data : "";
      // O id do botão manda: nunca reinterpretamos texto livre.
      const data = resolveInteractiveReply(rawData, rawData);
      if (!chatId || !data) return [];
      return [{
        channel: "telegram",
        externalConversationId: chatId,
        externalMessageId: `telegram_cb_${update.update_id}`,
        replyToMessageId: null,
        messageType: "callback",
        text: data,
        media: null,
        callback: { data, callbackQueryId: String(cq.id) },
        sender: cq?.from
          ? { firstName: cq.from.first_name ?? null, lastName: cq.from.last_name ?? null, username: cq.from.username ?? null }
          : null,
        metadata: { rawType: "callback" },
        receivedAt: new Date(),
      }];
    }

    const msg = update.message ?? update.edited_message;
    if (!msg?.chat?.id) return [];
    const chatId = String(msg.chat.id);
    const replyTo = msg?.message_id ? String(msg.message_id) : null;
    const { kind, raw } = detectMessageType(msg);

    let text: string | null = null;
    let media: NormalizedInbound["media"] = null;
    const caption: string | null = msg?.caption ?? msg?.document?.caption ?? null;

    if (kind === "text") {
      text = String(msg.text ?? "");
    } else if (kind === "image" || kind === "document" || kind === "audio") {
      const { fileId, fileName } = fileIdFor(msg, raw);
      if (!fileId) {
        return [{
          channel: "telegram",
          externalConversationId: chatId,
          externalMessageId: `telegram_${update.update_id}`,
          replyToMessageId: replyTo,
          messageType: "unsupported",
          text: `[${raw}]`,
          media: null,
          callback: null,
          sender: msg?.from
            ? { firstName: msg.from.first_name ?? null, lastName: msg.from.last_name ?? null, username: msg.from.username ?? null }
            : null,
          metadata: { rawType: raw },
          receivedAt: new Date(),
        }];
      }
      media = { externalFileId: fileId, fileName: fileName ?? null, mimeType: null, size: null, caption };
      text = caption;
    } else {
      text = `[${raw}]`;
    }

    return [{
      channel: "telegram",
      externalConversationId: chatId,
      externalMessageId: `telegram_${update.update_id}`,
      replyToMessageId: replyTo,
      messageType: kind,
      text,
      media,
      callback: null,
      sender: msg?.from
        ? { firstName: msg.from.first_name ?? null, lastName: msg.from.last_name ?? null, username: msg.from.username ?? null }
        : null,
      metadata: { rawType: raw, caption },
      receivedAt: new Date(),
    }];
  },

  async isAlreadyProcessed(supabaseAdmin: any, externalMessageId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("assessor_messages")
      .select("id")
      .eq("whatsapp_message_id", externalMessageId)
      .maybeSingle();
    return Boolean(data);
  },

  async persistInbound(supabaseAdmin, inbound, userId) {
    const rawType = String(inbound.metadata?.rawType ?? inbound.messageType);
    const content = inbound.text ?? `[${inbound.messageType}]`;
    const { data } = await supabaseAdmin
      .from("assessor_messages")
      .insert({
        user_id: userId,
        role: "user",
        content,
        message_type: `telegram_${rawType}`,
        status: "received",
        channel: "telegram",
        sender_phone: inbound.externalConversationId,
        whatsapp_message_id: inbound.externalMessageId,
      })
      .select("id")
      .single();
    return (data as { id?: string } | null)?.id ?? null;
  },

  async onboardIfMissingUser(supabaseAdmin, inbound) {
    const provider = getTelegramProvider();
    const text = inbound.text ?? "";
    const chatId = inbound.externalConversationId;
    const displayName =
      [inbound.sender?.firstName, inbound.sender?.lastName].filter(Boolean).join(" ").trim() || null;
    const {
      extractLinkToken,
      consumeLinkToken,
      loadPairing,
      stepPairing,
    } = await import("@/lib/telegram/pairing.server");

    // B) Deep link a partir das Definições: liga já à conta certa.
    const token = extractLinkToken(text);
    if (token) {
      const r = await consumeLinkToken(supabaseAdmin, token, chatId, displayName);
      if (r.reply) await provider.sendText({ chatId, text: r.reply });
      return { handled: true, userId: r.userId ?? null, stopPipeline: r.stopPipeline ?? false };
    }

    // A) Emparelhamento explícito. Se já há conversa de emparelhamento a
    // decorrer, ela manda — nunca cai em criação de conta pelo caminho.
    const pairing = await loadPairing(supabaseAdmin, chatId);
    const code = text ? extractInviteCode(text) : null;
    if (pairing || !code) {
      // Códigos de convite/promo continuam a ter precedência no primeiro
      // contacto (equipa e planos pagos entram directos).
      if (!pairing && text) {
        const { looksLikePromoCode, redeemPromoCode, PROMO_REPLY, applyPromoBeta } = await import("@/lib/admin/promo.server");
        if (looksLikePromoCode(text)) {
          const promo = await redeemPromoCode(supabaseAdmin, text);
          if (!promo.ok) {
            if (promo.reason !== "not_found") {
              await provider.sendText({ chatId, text: PROMO_REPLY[promo.reason] });
              return { handled: true };
            }
          } else {
            const claimed = await createShadowAccount(supabaseAdmin, chatId, inbound.sender, promo.tier);
            if (!claimed.ok) {
              await provider.sendText({ chatId, text: claimed.reply });
              return { handled: true };
            }
            if (claimed.userId) await applyPromoBeta(supabaseAdmin, claimed.userId, promo.betaDays);
            await provider.sendText({
              chatId,
              text: REPLY_ONBOARDING((inbound.sender?.firstName ?? "").trim()),
            });
            return { handled: true, userId: claimed.userId, stopPipeline: true };
          }
        }
      }

      const step = await stepPairing(supabaseAdmin, chatId, text, displayName);
      if (step.reply) await provider.sendText({ chatId, text: step.reply });
      if (step.userId) {
        return { handled: true, userId: step.userId, stopPipeline: step.stopPipeline ?? true };
      }
      if (!step.createAccount) return { handled: true };

      // Respondeu que não tem conta: fluxo antigo, conta nova 'base'.
      const auto = await createShadowAccount(supabaseAdmin, chatId, inbound.sender, "base");
      if (!auto.ok) {
        await provider.sendText({ chatId, text: auto.reply });
        return { handled: true };
      }
      await provider.sendText({
        chatId,
        text: REPLY_ONBOARDING((inbound.sender?.firstName ?? "").trim()),
      });
      return { handled: true, userId: auto.userId, stopPipeline: true };
    }
    const claim = await claimInvite(supabaseAdmin, code, inbound.externalConversationId, inbound.sender);
    if (!claim.ok) {
      await provider.sendText({ chatId: inbound.externalConversationId, text: claim.reply });
      return { handled: true };
    }
    const firstName = (inbound.sender?.firstName ?? "").trim();
    await provider.sendText({
      chatId: inbound.externalConversationId,
      text: REPLY_ONBOARDING(firstName),
    });
    return { handled: true, userId: claim.userId, stopPipeline: true };
  },

  async fetchMedia(inbound: NormalizedInbound): Promise<AdapterMediaBytes> {
    if (!inbound.media?.externalFileId) return { ok: false, error: "no_media" };
    const provider = getTelegramProvider();
    const info = await provider.getFile({ fileId: inbound.media.externalFileId });
    if (!info.ok || !info.filePath) return { ok: false, error: info.error ?? "getFile_failed" };
    const dl = await provider.downloadFile({ filePath: info.filePath });
    if (!dl.ok || !dl.buffer) return { ok: false, error: dl.error ?? "download_failed" };
    const mimeType = dl.mimeType ?? guessMime(info.filePath);
    const fileName = inbound.media.fileName ?? info.filePath.split("/").pop() ?? null;
    return { ok: true, bytes: dl.buffer, mimeType, fileName };
  },

  async sendText(externalConversationId, text, opts): Promise<AdapterSendResult> {
    const r = await getTelegramProvider().sendText({
      chatId: externalConversationId,
      text,
      replyToMessageId: opts?.replyTo ?? null,
    });
    return { ok: r.ok, messageId: r.messageId ?? null, error: r.error };
  },

  async answerInteraction(callbackQueryId: string, feedback?: string) {
    await getTelegramProvider().answerCallback({
      callbackQueryId,
      ...(feedback ? { text: feedback } : {}),
    });
  },

  // Paridade com o WhatsApp: as mesmas perguntas fechadas chegam ao
  // Telegram como botões inline, com o mesmo id determinístico.
  async sendInteractive(externalConversationId, prompt): Promise<AdapterSendResult> {
    const r = await getTelegramProvider().sendOptions({
      chatId: externalConversationId,
      text: prompt.body,
      options: prompt.options.map((o) => ({ label: o.label, callbackData: o.id })),
    });
    return { ok: r.ok, messageId: r.messageId ?? null, error: r.error };
  },

  // Cartão nativo do Telegram (tocar → guardar nos contactos).
  async sendContact(externalConversationId, contact): Promise<AdapterSendResult> {
    const provider = getTelegramProvider();
    if (!provider.sendContact || !contact.phone) {
      return { ok: false, messageId: null, error: "sendContact indisponível" };
    }
    const parts = contact.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : null;
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : contact.name.trim();
    const r = await provider.sendContact({
      chatId: externalConversationId,
      phone: contact.phone,
      firstName: first,
      lastName: last,
      vcard: contact.vcard ?? null,
    });
    return { ok: r.ok, messageId: r.messageId ?? null, error: r.error };
  },

  async sendDocument(externalConversationId, doc): Promise<AdapterSendResult> {
    const provider = getTelegramProvider();
    if (!provider.sendDocumentByUrl || !doc.url) {
      return { ok: false, messageId: null, error: "sendDocument indisponível" };
    }
    const r = await provider.sendDocumentByUrl({
      chatId: externalConversationId,
      url: doc.url,
      fileName: doc.fileName,
      caption: doc.caption ?? null,
    });
    return { ok: r.ok, messageId: r.messageId ?? null, error: r.error };
  },
};

async function claimInvite(
  supabaseAdmin: any,
  code: string,
  chatId: string,
  sender: NormalizedInbound["sender"],
): Promise<
  | { ok: true; userId: string }
  | { ok: false; reply: string }
> {
  const { data: invite } = await supabaseAdmin
    .from("telegram_invites")
    .select("code, subscription_tier, expires_at, used_by, used_at")
    .eq("code", code)
    .maybeSingle();
  if (!invite) return { ok: false, reply: REPLY_INVITE_INVALID };
  if (invite.used_by) return { ok: false, reply: REPLY_INVITE_USED };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, reply: REPLY_INVITE_EXPIRED };
  }

  const created = await createShadowAccount(supabaseAdmin, chatId, sender, invite.subscription_tier ?? "base");
  if (!created.ok) return created;
  const userId = created.userId;

  await supabaseAdmin
    .from("telegram_invites")
    .update({ used_by: userId, used_at: new Date().toISOString(), used_chat_id: chatId })
    .eq("code", code);

  return { ok: true, userId };
}

// Cria a shadow account de Telegram com o tier indicado (convite ou código promocional).
async function createShadowAccount(
  supabaseAdmin: any,
  chatId: string,
  sender: NormalizedInbound["sender"],
  tier: string,
): Promise<{ ok: true; userId: string } | { ok: false; reply: string }> {
  const email = `tg-${chatId}@shadow.assessor.local`;
  const displayName =
    [sender?.firstName, sender?.lastName].filter(Boolean).join(" ").trim() ||
    (sender?.username ? `@${sender.username}` : `Telegram ${chatId}`);

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      source: "telegram_shadow",
      chat_id: chatId,
      name: displayName,
      telegram_username: sender?.username ?? null,
    },
  });
  if (createErr || !created?.user?.id) {
    console.error("[telegram-adapter] createUser:", createErr);
    return { ok: false, reply: REPLY_ENGINE_ERROR };
  }
  const userId = created.user.id as string;

  await supabaseAdmin
    .from("profiles")
    .update({
      subscription_tier: tier,
      primary_channel: "telegram",
      name: displayName,
    })
    .eq("id", userId);

  await supabaseAdmin
    .from("consultant_preferences")
    .upsert(
      { user_id: userId, autonomy_level: "conservative", primary_channel: "telegram" },
      { onConflict: "user_id" },
    );

  await linkChannelToUser(supabaseAdmin, "telegram", chatId, userId, displayName);

  return { ok: true, userId };
}

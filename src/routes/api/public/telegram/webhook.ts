// Webhook público do Telegram Bot API.
// Fluxo: verificar secret_token → normalizar update → resolver utilizador
// pelo channel_link (ou resgatar convite / recusar) → delegar ao motor v3
// (processAssessorMessage) → responder pelo TelegramProvider.

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { getTelegramProvider, deriveTelegramWebhookSecret } from "@/lib/telegram/provider.server";
import {
  findUserIdByChannel,
  linkChannelToUser,
  sendReplyForChannel,
} from "@/lib/assessor/channels.server";

const REPLY_PRIVATE =
  "Este bot é privado (piloto). Precisas de um código de convite para começar. Envia-o no formato /start <código> ou apenas o código.";
const REPLY_INVITE_INVALID = "Não reconheci esse código de convite. Confirma-o com quem te enviou.";
const REPLY_INVITE_EXPIRED = "Esse convite já expirou. Pede um novo à equipa.";
const REPLY_INVITE_USED = "Esse convite já foi resgatado por outra conta.";
const REPLY_ENGINE_ERROR = "Recebi a tua mensagem mas não consegui processá-la agora. Tenta daqui a pouco.";
const REPLY_UNSUPPORTED = "Ainda não sei processar este tipo de conteúdo aqui.";
const REPLY_ONBOARDING = (name: string) =>
  `Olá${name ? ` ${name}` : ""}! Sou o teu Assessor. Falamos por aqui como se fosse WhatsApp — dizes-me em linguagem natural e eu organizo pessoas, imóveis, agenda e prospeção.\n\nExperimenta: "Placa Santa Maria da Feira junto ao Castelo, 932145678 Apartamento"`;

function safeEqStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

function extractInviteCode(text: string): string | null {
  const trimmed = text.trim();
  const startMatch = trimmed.match(/^\/start(?:@\w+)?\s+([A-Z0-9-]{4,32})$/i);
  if (startMatch) return startMatch[1].toUpperCase();
  const bare = trimmed.match(/^[A-Z0-9]{3,10}-[A-Z0-9]{3,10}$/i);
  if (bare) return trimmed.toUpperCase();
  return null;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.TELEGRAM_API_KEY || !process.env.LOVABLE_API_KEY) {
          console.error("[telegram-webhook] secrets em falta");
          return new Response("Server misconfigured", { status: 500 });
        }

        let expectedSecret: string;
        try {
          expectedSecret = await deriveTelegramWebhookSecret();
        } catch (err) {
          console.error("[telegram-webhook] derive secret:", err);
          return new Response("Server misconfigured", { status: 500 });
        }

        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqStr(actual, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: any;
        try { update = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }

        try { await handleUpdate(update); }
        catch (err) { console.error("[telegram-webhook] erro:", err instanceof Error ? err.message : err); }
        return Response.json({ ok: true });
      },
    },
  },
});

async function handleUpdate(update: any): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!update || typeof update.update_id !== "number") return;

  if (update.callback_query) {
    await handleCallbackQuery(supabaseAdmin, update.callback_query);
    return;
  }

  const msg = update.message ?? update.edited_message;
  if (!msg?.chat?.id) return;

  const chatId = String(msg.chat.id);
  const messageId = msg.message_id ? String(msg.message_id) : null;
  const provider = getTelegramProvider();

  const dedupeKey = `telegram_${update.update_id}`;
  const { data: existing } = await supabaseAdmin
    .from("assessor_messages")
    .select("id")
    .eq("whatsapp_message_id", dedupeKey)
    .maybeSingle();
  if (existing) return;

  const type = detectMessageType(msg);
  const userId = await findUserIdByChannel(supabaseAdmin, "telegram", chatId);
  const rawContent = extractTextForLog(msg, type);

  const { data: inserted } = await supabaseAdmin
    .from("assessor_messages")
    .insert({
      user_id: userId,
      role: "user",
      content: rawContent,
      message_type: `telegram_${type}`,
      status: "received",
      channel: "telegram",
      sender_phone: chatId,
      whatsapp_message_id: dedupeKey,
    })
    .select("id")
    .single();
  const sourceMessageUuid = (inserted as { id?: string } | null)?.id ?? null;

  if (!userId) {
    const text = typeof msg.text === "string" ? msg.text : "";
    const code = text ? extractInviteCode(text) : null;
    if (!code) { await provider.sendText({ chatId, text: REPLY_PRIVATE }); return; }
    const claim = await claimInvite(supabaseAdmin, code, chatId, msg.from);
    if (!claim.ok) { await provider.sendText({ chatId, text: claim.reply }); return; }
    const firstName = String(msg.from?.first_name ?? "").trim();
    await provider.sendText({ chatId, text: REPLY_ONBOARDING(firstName) });
    return;
  }

  if (type === "text") {
    const body = String(msg.text ?? "").trim();
    if (!body) return;
    try {
      const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
      const outcome = await processAssessorMessage({
        supabase: supabaseAdmin,
        userId,
        channel: "telegram",
        content: body,
        receivedAt: new Date(),
        sourceMessageId: sourceMessageUuid,
      });
      await deliverReply(supabaseAdmin, "telegram", chatId, userId, outcome, messageId);
    } catch (err) {
      console.error("[telegram-webhook] engine:", err instanceof Error ? err.message : err);
      await sendReplyForChannel("telegram", chatId, REPLY_ENGINE_ERROR);
    }
    return;
  }

  if (type === "photo" || type === "document" || type === "voice" || type === "audio") {
    await handleMedia(supabaseAdmin, { msg, type, chatId, userId, sourceMessageUuid });
    return;
  }

  await provider.sendText({ chatId, text: REPLY_UNSUPPORTED });
}

function detectMessageType(msg: any): string {
  if (typeof msg.text === "string") return "text";
  if (msg.photo) return "photo";
  if (msg.document) return "document";
  if (msg.voice) return "voice";
  if (msg.audio) return "audio";
  if (msg.video) return "video";
  if (msg.sticker) return "sticker";
  if (msg.location) return "location";
  if (msg.contact) return "contact";
  return "unknown";
}

function extractTextForLog(msg: any, type: string): string {
  if (type === "text") return String(msg.text ?? "");
  const caption = msg.caption ?? msg.document?.caption ?? "";
  return caption ? String(caption) : `[${type}]`;
}

async function deliverReply(
  supabaseAdmin: any,
  channel: "telegram",
  chatId: string,
  userId: string,
  outcome: { reply: string; messageType?: string | null },
  replyTo: string | null,
) {
  const alreadyPersisted = outcome.messageType === "__ALREADY_PERSISTED__";
  const provider = getTelegramProvider();
  const send = await provider.sendText({ chatId, text: outcome.reply, replyToMessageId: replyTo });
  if (!alreadyPersisted) {
    await supabaseAdmin.from("assessor_messages").insert({
      user_id: userId,
      role: "assistant",
      content: outcome.reply,
      message_type: "assistant_text",
      status: send.ok ? "sent" : "failed",
      channel,
      sender_phone: chatId,
    });
  }
}

async function handleMedia(
  supabaseAdmin: any,
  args: { msg: any; type: string; chatId: string; userId: string; sourceMessageUuid: string | null },
) {
  const { msg, type, chatId, userId, sourceMessageUuid } = args;
  const provider = getTelegramProvider();

  let fileId: string | undefined;
  let fileName: string | null = null;
  if (type === "photo") { const arr = msg.photo as any[]; fileId = arr?.[arr.length - 1]?.file_id; }
  else if (type === "document") { fileId = msg.document?.file_id; fileName = msg.document?.file_name ?? null; }
  else if (type === "voice") { fileId = msg.voice?.file_id; }
  else if (type === "audio") { fileId = msg.audio?.file_id; fileName = msg.audio?.file_name ?? null; }

  if (!fileId) { await provider.sendText({ chatId, text: REPLY_UNSUPPORTED }); return; }

  const info = await provider.getFile({ fileId });
  if (!info.ok || !info.filePath) {
    await provider.sendText({ chatId, text: "Não consegui aceder ao ficheiro que enviaste. Tenta reenviar." });
    return;
  }
  const dl = await provider.downloadFile({ filePath: info.filePath });
  if (!dl.ok || !dl.buffer) {
    await provider.sendText({ chatId, text: "Recebi mas não consegui descarregar. Tenta reenviar." });
    return;
  }

  const mimeType = dl.mimeType ?? guessMime(info.filePath);
  const { processIncomingFile } = await import("@/lib/assessor/files.server");
  await processIncomingFile({
    supabase: supabaseAdmin,
    userId,
    channel: "telegram",
    externalFileId: fileId,
    fileName: fileName ?? info.filePath.split("/").pop() ?? null,
    mimeType,
    size: dl.buffer.byteLength,
    bytes: dl.buffer,
    sourceMessageId: sourceMessageUuid,
  } as any);

  if (type === "voice" || type === "audio") {
    try {
      const { transcribeAudio } = await import("@/lib/ai/transcribe.server");
      const t = await (transcribeAudio as any)(dl.buffer, mimeType);
      if (t?.ok && t.text) {
        const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
        const outcome = await processAssessorMessage({
          supabase: supabaseAdmin,
          userId,
          channel: "telegram",
          content: t.text,
          receivedAt: new Date(),
          sourceMessageId: sourceMessageUuid,
        });
        await deliverReply(supabaseAdmin, "telegram", chatId, userId, outcome, null);
        return;
      }
    } catch (err) {
      console.error("[telegram-webhook] transcribe:", err instanceof Error ? err.message : err);
    }
    await provider.sendText({ chatId, text: "Recebi o áudio mas não consegui transcrevê-lo. Guardei em Drive." });
    return;
  }

  await provider.sendText({ chatId, text: "Recebi o teu ficheiro e vou tratar de o organizar." });
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

async function handleCallbackQuery(supabaseAdmin: any, cq: any): Promise<void> {
  const provider = getTelegramProvider();
  const chatId = cq.message?.chat?.id ? String(cq.message.chat.id) : null;
  const data = typeof cq.data === "string" ? cq.data : "";
  if (!chatId || !data) { await provider.answerCallback({ callbackQueryId: cq.id }); return; }
  const userId = await findUserIdByChannel(supabaseAdmin, "telegram", chatId);
  if (!userId) { await provider.answerCallback({ callbackQueryId: cq.id, text: "Conta não ligada" }); return; }
  try {
    const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
    const outcome = await processAssessorMessage({
      supabase: supabaseAdmin,
      userId,
      channel: "telegram",
      content: data,
      receivedAt: new Date(),
      sourceMessageId: null,
    });
    await provider.answerCallback({ callbackQueryId: cq.id });
    await deliverReply(supabaseAdmin, "telegram", chatId, userId, outcome, null);
  } catch (err) {
    console.error("[telegram-webhook] callback engine:", err instanceof Error ? err.message : err);
    await provider.answerCallback({ callbackQueryId: cq.id, text: "Falhei a processar. Tenta de novo." });
  }
}

async function claimInvite(
  supabaseAdmin: any,
  code: string,
  chatId: string,
  from: any,
): Promise<{ ok: true } | { ok: false; reply: string }> {
  const { data: invite } = await supabaseAdmin
    .from("telegram_invites")
    .select("code, plan_tier, expires_at, used_by, used_at")
    .eq("code", code)
    .maybeSingle();
  if (!invite) return { ok: false, reply: REPLY_INVITE_INVALID };
  if (invite.used_by) return { ok: false, reply: REPLY_INVITE_USED };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, reply: REPLY_INVITE_EXPIRED };
  }

  const email = `tg-${chatId}@shadow.assessor.local`;
  const displayName =
    [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim() ||
    (from?.username ? `@${from.username}` : `Telegram ${chatId}`);

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      source: "telegram_shadow",
      chat_id: chatId,
      name: displayName,
      telegram_username: from?.username ?? null,
    },
  });
  if (createErr || !created?.user?.id) {
    console.error("[telegram-webhook] createUser:", createErr);
    return { ok: false, reply: REPLY_ENGINE_ERROR };
  }
  const userId = created.user.id as string;

  await supabaseAdmin
    .from("profiles")
    .update({
      plan_tier: invite.plan_tier ?? "free",
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

  await supabaseAdmin
    .from("telegram_invites")
    .update({ used_by: userId, used_at: new Date().toISOString(), used_chat_id: chatId })
    .eq("code", code);

  return { ok: true };
}

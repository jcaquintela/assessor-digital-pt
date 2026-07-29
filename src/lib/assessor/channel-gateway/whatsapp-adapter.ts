// Adapter WhatsApp para o Channel Gateway.
// Reúne toda a lógica específica da Meta Cloud API: parsing do payload,
// download de media, envio, dedupe, persistência do turno e o fluxo legado
// de link code (LIGAR-XXXXXX). Não conhece o motor: só transporta.

import { normalizePhone } from "@/lib/whatsapp/phone";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import {
  hashLinkCode,
  WHATSAPP_CODE_MAX_ATTEMPTS,
  WHATSAPP_CODE_PATTERN,
} from "@/lib/whatsapp/link.functions";
import type {
  AdapterMediaBytes,
  AdapterSendResult,
  ChannelAdapter,
  NormalizedInbound,
  NormalizedMessageType,
} from "./types";

const REPLY_UNASSOCIATED =
  "Olá. Este número ainda não está associado a uma conta do Assessor. Entra no dashboard e confirma o teu número de WhatsApp.";
const REPLY_UNSUPPORTED_TYPE =
  "Recebi a tua mensagem, mas ainda não sei processar este tipo de conteúdo.";
const REPLY_MEDIA_ERROR =
  "Recebi o teu envio mas não consegui descarregá-lo. Tenta enviar novamente.";
const REPLY_TRANSCRIBE_FAIL =
  "Recebi a mensagem de voz, mas não consegui transcrever agora. Guardei o áudio em Diversos → Ficheiros.";
const REPLY_ENGINE_ERROR =
  "Recebi a tua mensagem, mas não consegui processá-la agora. Tenta novamente dentro de instantes.";
const REPLY_LINK_OK =
  "A tua conta ficou associada ao WhatsApp. Já podes começar a falar com o teu Assessor.";
const REPLY_LINK_EXPIRED = "Este código expirou. Gera um novo código no dashboard.";
const REPLY_LINK_INVALID =
  "Não consegui validar este código. Confirma o código no dashboard e tenta novamente.";

function classifyType(type: string | undefined): NormalizedMessageType {
  switch (type) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "document":
      return "document";
    case "audio":
    case "voice":
      return "audio";
    case "interactive":
    case "button":
      return "callback";
    case "reaction":
    case "system":
      return "reaction";
    default:
      return "unsupported";
  }
}

function extractCallback(msg: any): { text: string; id: string } | null {
  const interactive = msg?.interactive ?? {};
  const buttonReply = interactive?.button_reply ?? null;
  const listReply = interactive?.list_reply ?? null;
  const btn = msg?.button ?? null;
  const label: string =
    buttonReply?.title ??
    listReply?.title ??
    btn?.text ??
    btn?.payload ??
    "";
  const id: string =
    buttonReply?.id ??
    listReply?.id ??
    btn?.payload ??
    msg?.id ??
    "";
  const text = String(label ?? "").trim();
  if (!text) return null;
  return { text, id: String(id ?? "") };
}

function mediaNodeFor(msg: any, type: string): any {
  if (type === "image") return msg?.image;
  if (type === "document") return msg?.document;
  if (type === "audio") return msg?.audio;
  if (type === "voice") return msg?.voice ?? msg?.audio;
  return null;
}

export const whatsappAdapter: ChannelAdapter = {
  channel: "whatsapp",
  replyUnassociated: REPLY_UNASSOCIATED,
  replyUnsupported: REPLY_UNSUPPORTED_TYPE,
  replyEngineError: REPLY_ENGINE_ERROR,
  replyMediaError: REPLY_MEDIA_ERROR,
  replyTranscribeFail: REPLY_TRANSCRIBE_FAIL,

  parseUpdate(rawPayload: unknown): NormalizedInbound[] {
    const payload = rawPayload as any;
    const out: NormalizedInbound[] = [];
    const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;
        if (value.statuses && !value.messages) continue; // delivery/status
        const messages: any[] = Array.isArray(value.messages) ? value.messages : [];
        for (const msg of messages) {
          const wamid: string | undefined = msg?.id;
          const fromRaw: string | undefined = msg?.from;
          const type: string | undefined = msg?.type;
          if (!wamid || !fromRaw || !type) continue;
          const senderPhone = normalizePhone(fromRaw);
          if (!senderPhone) continue;
          const kind = classifyType(type);
          const cap: string | null =
            msg?.image?.caption ?? msg?.document?.caption ?? null;
          let text: string | null = null;
          let callback = null as NormalizedInbound["callback"];
          let media = null as NormalizedInbound["media"];
          if (kind === "text") {
            text = String(msg?.text?.body ?? "");
          } else if (kind === "callback") {
            const cb = extractCallback(msg);
            if (!cb) continue;
            text = cb.text;
            callback = { data: cb.text, callbackQueryId: cb.id };
          } else if (kind === "image" || kind === "document" || kind === "audio") {
            const node = mediaNodeFor(msg, type) ?? {};
            const mediaId: string | undefined = node?.id;
            if (!mediaId) continue;
            media = {
              externalFileId: mediaId,
              fileName: node?.filename ?? null,
              mimeType: node?.mime_type ?? null,
              size: null,
              caption: cap,
            };
            text = cap;
          } else if (kind === "reaction") {
            text = `[${type}]`;
          }
          out.push({
            channel: "whatsapp",
            externalConversationId: senderPhone,
            externalMessageId: wamid,
            replyToMessageId: null,
            messageType: kind,
            text,
            media,
            callback,
            sender: null,
            metadata: { rawType: type, caption: cap },
            receivedAt: new Date(),
          });
        }
      }
    }
    return out;
  },

  async isAlreadyProcessed(supabaseAdmin: any, externalMessageId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from("assessor_messages")
      .select("id")
      .eq("whatsapp_message_id", externalMessageId)
      .maybeSingle();
    return Boolean(data);
  },

  async persistInbound(
    supabaseAdmin: any,
    inbound: NormalizedInbound,
    userId: string | null,
  ): Promise<string | null> {
    const messageType = `whatsapp_${inbound.metadata?.rawType ?? inbound.messageType}`;
    const content = inbound.text ?? `[${inbound.messageType}]`;
    const { data } = await supabaseAdmin
      .from("assessor_messages")
      .insert({
        user_id: userId,
        role: "user",
        content,
        message_type: messageType,
        status: "received",
        channel: "whatsapp",
        sender_phone: inbound.externalConversationId,
        whatsapp_message_id: inbound.externalMessageId,
      })
      .select("id")
      .single();
    return (data as { id?: string } | null)?.id ?? null;
  },

  async interceptBeforeIngest(
    supabaseAdmin: any,
    inbound: NormalizedInbound,
  ): Promise<{ handled: boolean }> {
    if (inbound.messageType !== "text" || !inbound.text) return { handled: false };
    const match = inbound.text.match(WHATSAPP_CODE_PATTERN);
    if (!match) return { handled: false };
    // Persistir a mensagem primeiro (dedupe respeitado, sem user_id ainda).
    await this.persistInbound(supabaseAdmin, inbound, null);
    const result = await tryLinkCode(
      supabaseAdmin,
      inbound.externalConversationId,
      match[0],
    );
    await sendAndStoreWhatsAppAssistant(
      supabaseAdmin,
      inbound.externalConversationId,
      result.userId,
      result.reply,
    );
    return { handled: true };
  },

  async fetchMedia(inbound: NormalizedInbound): Promise<AdapterMediaBytes> {
    if (!inbound.media?.externalFileId) return { ok: false, error: "no_media" };
    try {
      const { downloadWhatsAppMedia } = await import("@/lib/whatsapp/media.server");
      const m = await downloadWhatsAppMedia(inbound.media.externalFileId);
      return {
        ok: true,
        bytes: m.bytes,
        mimeType: m.mimeType,
        fileName: inbound.media.fileName,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async sendText(
    externalConversationId: string,
    text: string,
  ): Promise<AdapterSendResult> {
    const r = await sendWhatsAppText(externalConversationId, text, { kind: "auto" });
    if (r.ok) return { ok: true, messageId: r.messageId ?? null };
    return { ok: false, messageId: null, error: r.error };
  },
};

// -------------- LIGAR-XXXXXX (legado, específico WhatsApp) -----------------

async function bumpAttempts(supabaseAdmin: any, id: string, current: number) {
  const next = current + 1;
  const patch: Record<string, unknown> = { attempts: next };
  if (next >= WHATSAPP_CODE_MAX_ATTEMPTS) patch.used_at = new Date().toISOString();
  await supabaseAdmin.from("whatsapp_link_codes").update(patch as never).eq("id", id);
}

async function sendAndStoreWhatsAppAssistant(
  supabaseAdmin: any,
  toPhone: string,
  userId: string | null,
  body: string,
): Promise<void> {
  const result = await sendWhatsAppText(toPhone, body, { kind: "auto" });
  await supabaseAdmin.from("assessor_messages").insert({
    user_id: userId,
    role: "assistant",
    content: body,
    message_type: "whatsapp_text",
    status: result.ok ? "sent" : "failed",
    channel: "whatsapp",
    sender_phone: toPhone,
    whatsapp_message_id: result.ok ? result.messageId : null,
  });
}

async function tryLinkCode(
  supabaseAdmin: any,
  senderPhone: string,
  rawCode: string,
): Promise<{ reply: string; userId: string | null }> {
  const codeHash = hashLinkCode(rawCode);
  const nowIso = new Date().toISOString();

  const { data: found } = await supabaseAdmin
    .from("whatsapp_link_codes")
    .select("id, user_id, phone, expires_at, used_at, attempts")
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .maybeSingle();

  if (found) {
    const row = found as {
      id: string;
      user_id: string;
      phone: string;
      expires_at: string;
      attempts: number;
    };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("whatsapp_link_codes")
        .update({ used_at: nowIso } as never)
        .eq("id", row.id);
      return { reply: REPLY_LINK_EXPIRED, userId: null };
    }
    if (row.phone !== senderPhone) {
      await bumpAttempts(supabaseAdmin, row.id, row.attempts);
      return { reply: REPLY_LINK_INVALID, userId: null };
    }
    const { data: takenBy } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", senderPhone)
      .eq("whatsapp_link_status", "linked")
      .neq("id", row.user_id);
    if (takenBy && takenBy.length > 0) {
      await supabaseAdmin
        .from("whatsapp_link_codes")
        .update({ used_at: nowIso } as never)
        .eq("id", row.id);
      return { reply: REPLY_LINK_INVALID, userId: null };
    }

    await supabaseAdmin
      .from("whatsapp_link_codes")
      .update({ used_at: nowIso } as never)
      .eq("id", row.id);
    await supabaseAdmin
      .from("profiles")
      .update({
        phone: senderPhone,
        whatsapp_link_status: "linked",
        whatsapp_linked_at: nowIso,
        phone_verified_at: nowIso,
      } as never)
      .eq("id", row.user_id);
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: row.user_id,
      action: "whatsapp.linked",
      target_user_id: row.user_id,
      resource_type: "whatsapp",
      metadata: { phone: senderPhone } as never,
    } as never);
    return { reply: REPLY_LINK_OK, userId: row.user_id };
  }

  const { data: activeForSender } = await supabaseAdmin
    .from("whatsapp_link_codes")
    .select("id, attempts, expires_at")
    .eq("phone", senderPhone)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeForSender) {
    const row = activeForSender as { id: string; attempts: number; expires_at: string };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("whatsapp_link_codes")
        .update({ used_at: nowIso } as never)
        .eq("id", row.id);
      return { reply: REPLY_LINK_EXPIRED, userId: null };
    }
    await bumpAttempts(supabaseAdmin, row.id, row.attempts);
  }
  return { reply: REPLY_LINK_INVALID, userId: null };
}

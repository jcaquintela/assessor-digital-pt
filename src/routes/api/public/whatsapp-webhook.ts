import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import {
  hashLinkCode,
  WHATSAPP_CODE_MAX_ATTEMPTS,
  WHATSAPP_CODE_PATTERN,
} from "@/lib/whatsapp/link.functions";

// Webhook público da Meta WhatsApp Cloud API.
// Caminho: /api/public/whatsapp-webhook  (bypassa autenticação do site).
//
// GET  -> verificação do webhook (hub.mode / hub.verify_token / hub.challenge)
// POST -> receção de eventos:
//   - valida assinatura HMAC (X-Hub-Signature-256) com WHATSAPP_APP_SECRET;
//   - persiste mensagens de texto em assessor_messages (channel = 'whatsapp');
//   - deduplica por whatsapp_message_id;
//   - identifica consultor por profiles.phone;
//   - responde com uma mensagem simples via WhatsApp Cloud API.

const REPLY_UNASSOCIATED =
  "Olá. Este número ainda não está associado a uma conta do Assessor. Entra no dashboard e confirma o teu número de WhatsApp.";
const REPLY_UNSUPPORTED_TYPE =
  "Recebi a tua mensagem, mas ainda não sei processar este tipo de conteúdo.";
const REPLY_MEDIA_ERROR =
  "Recebi o teu envio mas não consegui descarregá-lo. Tenta enviar novamente.";
const REPLY_TRANSCRIBE_FAIL =
  "Recebi a mensagem de voz, mas não consegui transcrever agora. Guardei o áudio em Diversos → Ficheiros.";
const REPLY_LINK_OK =
  "A tua conta ficou associada ao WhatsApp. Já podes começar a falar com o teu Assessor.";
const REPLY_LINK_EXPIRED =
  "Este código expirou. Gera um novo código no dashboard.";
const REPLY_LINK_INVALID =
  "Não consegui validar este código. Confirma o código no dashboard e tenta novamente.";
const REPLY_ENGINE_ERROR =
  "Recebi a tua mensagem, mas não consegui processá-la agora. Tenta novamente dentro de instantes.";

function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length).trim();
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function findUserIdByPhone(supabaseAdmin: any, phone: string): Promise<string | null> {
  // Only linked accounts get automatic association.
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .eq("whatsapp_link_status", "linked")
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}
export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (!expected) {
          console.error("[whatsapp-webhook] WHATSAPP_VERIFY_TOKEN não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }

        if (mode === "subscribe" && token && token === expected && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const appSecret = process.env.WHATSAPP_APP_SECRET;
        if (!appSecret) {
          console.error("[whatsapp-webhook] WHATSAPP_APP_SECRET não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }

        const raw = await request.text();
        const signature = request.headers.get("x-hub-signature-256");
        if (!verifySignature(raw, signature, appSecret)) {
          console.warn("[whatsapp-webhook] assinatura inválida");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        // Process asynchronously-ish but await so Cloudflare Worker doesn't cut it off.
        try {
          await handleEvent(payload);
        } catch (err) {
          console.error("[whatsapp-webhook] erro a processar evento:", err instanceof Error ? err.message : err);
        }

        // Always 200 to Meta to avoid retries once signature is valid.
        return new Response("OK", { status: 200 });
      },
    },
  },
});

async function handleEvent(payload: any) {
  const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
  if (entries.length === 0) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  for (const entry of entries) {
    const changes: any[] = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) continue;
      // Ignore delivery/status events entirely.
      if (value.statuses && !value.messages) continue;
      const messages: any[] = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        await handleMessage(supabaseAdmin, msg);
      }
    }
  }
}

async function handleMessage(supabaseAdmin: any, msg: any) {
  const waMessageId: string | undefined = msg?.id;
  const fromRaw: string | undefined = msg?.from;
  const type: string | undefined = msg?.type;
  if (!waMessageId || !fromRaw || !type) return;

  const senderPhone = normalizePhone(fromRaw);
  if (!senderPhone) return;

  // Dedupe: already stored?
  const { data: existing } = await supabaseAdmin
    .from("assessor_messages")
    .select("id")
    .eq("whatsapp_message_id", waMessageId)
    .maybeSingle();
  if (existing) {
    console.log("[whatsapp-webhook] mensagem duplicada ignorada");
    return;
  }

  const userId = await findUserIdByPhone(supabaseAdmin, senderPhone);

  // Handle media types (image, document, audio/voice) via central file pipeline.
  if (type === "image" || type === "document" || type === "audio" || type === "voice") {
    await handleMediaMessage(supabaseAdmin, {
      msg,
      type,
      waMessageId,
      senderPhone,
      userId,
    });
    return;
  }

  if (type !== "text") {
    await supabaseAdmin.from("assessor_messages").insert({
      user_id: userId,
      role: "user",
      content: `[${type}]`,
      message_type: `whatsapp_${type}`,
      status: "received",
      channel: "whatsapp",
      sender_phone: senderPhone,
      whatsapp_message_id: waMessageId,
    });
    await replyAndStore(supabaseAdmin, senderPhone, userId, REPLY_UNSUPPORTED_TYPE);
    return;
  }

  const body: string = msg?.text?.body ?? "";

  // Insert and capture the row UUID — downstream columns like
  // pending_actions.source_message_id and prospecting_leads.source_message_id
  // are UUID, so we must never pass the raw wamid string there.
  const { data: insertedMsg } = await supabaseAdmin
    .from("assessor_messages")
    .insert({
      user_id: userId,
      role: "user",
      content: body,
      message_type: "whatsapp_text",
      status: "received",
      channel: "whatsapp",
      sender_phone: senderPhone,
      whatsapp_message_id: waMessageId,
    })
    .select("id")
    .single();
  const sourceMessageUuid =
    (insertedMsg as { id?: string } | null)?.id ?? null;

  // Attempt link-code validation before generic replies.
  const codeMatch = body.match(WHATSAPP_CODE_PATTERN);
  if (codeMatch) {
    const linkResult = await tryLinkCode(supabaseAdmin, senderPhone, codeMatch[0]);
    await replyAndStore(supabaseAdmin, senderPhone, linkResult.userId ?? userId, linkResult.reply);
    return;
  }

  if (!userId) {
    await replyAndStore(supabaseAdmin, senderPhone, null, REPLY_UNASSOCIATED);
    return;
  }

  try {
    const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
    const outcome = await processAssessorMessage({
      supabase: supabaseAdmin,
      userId,
      channel: "whatsapp",
      content: body,
      receivedAt: new Date(),
      sourceMessageId: sourceMessageUuid,
    });
    const alreadyPersisted = outcome.messageType === "__ALREADY_PERSISTED__";
    if (alreadyPersisted) {
      // Engine persisted the assessor draft with its structured payload.
      // We still send via WhatsApp, but don't insert a duplicate row.
      await sendWhatsAppText(senderPhone, outcome.reply, { kind: "auto" });
    } else {
      await replyAndStore(supabaseAdmin, senderPhone, userId, outcome.reply);
    }
  } catch (err) {
    console.error("[whatsapp-webhook] engine error:", err instanceof Error ? err.message : err);
    await replyAndStore(supabaseAdmin, senderPhone, userId, REPLY_ENGINE_ERROR);
  }
}

async function handleMediaMessage(
  supabaseAdmin: any,
  args: {
    msg: any;
    type: string;
    waMessageId: string;
    senderPhone: string;
    userId: string | null;
  },
) {
  const { msg, type, waMessageId, senderPhone, userId } = args;
  const node = msg?.[type] ?? msg?.audio ?? {};
  const mediaId: string | undefined = node?.id;
  const filename: string | undefined = node?.filename;
  const caption: string | undefined = msg?.image?.caption ?? msg?.document?.caption;

  // Persist the inbound event even if we cannot store the file.
  await supabaseAdmin.from("assessor_messages").insert({
    user_id: userId,
    role: "user",
    content: caption || `[${type}]`,
    message_type: `whatsapp_${type}`,
    status: "received",
    channel: "whatsapp",
    sender_phone: senderPhone,
    whatsapp_message_id: waMessageId,
  });

  if (!userId) {
    await replyAndStore(supabaseAdmin, senderPhone, null, REPLY_UNASSOCIATED);
    return;
  }
  if (!mediaId) {
    await replyAndStore(supabaseAdmin, senderPhone, userId, REPLY_MEDIA_ERROR);
    return;
  }

  // Look up the just-inserted message row id so file can be linked.
  const { data: srcRow } = await supabaseAdmin
    .from("assessor_messages")
    .select("id")
    .eq("whatsapp_message_id", waMessageId)
    .maybeSingle();
  const sourceMessageId = (srcRow as { id?: string } | null)?.id ?? null;

  // Download from Meta Graph.
  let media: { bytes: Uint8Array; mimeType: string; size: number };
  try {
    const { downloadWhatsAppMedia } = await import("@/lib/whatsapp/media.server");
    media = await downloadWhatsAppMedia(mediaId);
  } catch (err) {
    console.error("[whatsapp-webhook] media download error:", err instanceof Error ? err.message : err);
    await replyAndStore(supabaseAdmin, senderPhone, userId, REPLY_MEDIA_ERROR);
    return;
  }

  // Route through central file pipeline (validation + storage + persistence).
  const { processIncomingFile } = await import("@/lib/assessor/files.server");
  const result = await processIncomingFile({
    supabase: supabaseAdmin,
    userId,
    channel: "whatsapp",
    externalFileId: mediaId,
    fileName: filename ?? null,
    mimeType: media.mimeType,
    size: media.size,
    bytes: media.bytes,
    sourceMessageId,
  });

  // Audio → transcribe and feed the transcript into the assessor engine.
  if (result.ok && (type === "audio" || type === "voice")) {
    try {
      const { transcribeAudio } = await import("@/lib/ai/transcribe.server");
      const t = await transcribeAudio(media.bytes, media.mimeType);
      if (!t.ok || !t.text) {
        await replyAndStore(supabaseAdmin, senderPhone, userId, REPLY_TRANSCRIBE_FAIL);
        return;
      }
      // Persist the transcript as a user message so the engine has context.
      await supabaseAdmin.from("assessor_messages").insert({
        user_id: userId,
        role: "user",
        content: t.text,
        message_type: "whatsapp_audio_transcript",
        status: "received",
        channel: "whatsapp",
        sender_phone: senderPhone,
      });
      const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
      const outcome = await processAssessorMessage({
        supabase: supabaseAdmin,
        userId,
        channel: "whatsapp",
        content: t.text,
        receivedAt: new Date(),
      });
      if (outcome.messageType === "__ALREADY_PERSISTED__") {
        await sendWhatsAppText(senderPhone, outcome.reply, { kind: "auto" });
      } else {
        await replyAndStore(supabaseAdmin, senderPhone, userId, outcome.reply);
      }
      return;
    } catch (err) {
      console.error("[whatsapp-webhook] transcribe error:", err instanceof Error ? err.message : err);
      await replyAndStore(supabaseAdmin, senderPhone, userId, REPLY_TRANSCRIBE_FAIL);
      return;
    }
  }

  await replyAndStore(supabaseAdmin, senderPhone, userId, result.reply);
}

async function tryLinkCode(
  supabaseAdmin: any,
  senderPhone: string,
  rawCode: string,
): Promise<{ reply: string; userId: string | null }> {
  const codeHash = hashLinkCode(rawCode);
  const nowIso = new Date().toISOString();

  // Look up the code by hash (only unused codes have the partial index).
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
      // Sender doesn't match the phone the code was issued for.
      await bumpAttempts(supabaseAdmin, row.id, row.attempts);
      return { reply: REPLY_LINK_INVALID, userId: null };
    }
    // Enforce unique linked phone: safety net in case race conditions.
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

  // Code hash not found among active codes: might be wrong code from this sender.
  // Bump attempts on this sender's newest active code, if any.
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

async function bumpAttempts(supabaseAdmin: any, id: string, current: number) {
  const next = current + 1;
  const patch: Record<string, unknown> = { attempts: next };
  if (next >= WHATSAPP_CODE_MAX_ATTEMPTS) {
    patch.used_at = new Date().toISOString();
  }
  await supabaseAdmin
    .from("whatsapp_link_codes")
    .update(patch as never)
    .eq("id", id);
}

async function replyAndStore(
  supabaseAdmin: any,
  toPhone: string,
  userId: string | null,
  body: string,
) {
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
    structured_payload: result.ok
      ? null
      : ({
          error: result.error,
          http_status: result.telemetry.httpStatus,
          error_code: result.telemetry.errorCode,
          error_subcode: result.telemetry.errorSubcode,
          error_type: result.telemetry.errorType,
          fbtrace_id: result.telemetry.fbtraceId,
        } as any),
  });
}
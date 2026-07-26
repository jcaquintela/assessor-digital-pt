import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";

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

const REPLY_ASSOCIATED =
  "Olá. A tua mensagem foi recebida pelo Assessor. A ligação ao WhatsApp está ativa.";
const REPLY_UNASSOCIATED =
  "Olá. Este número ainda não está associado a uma conta do Assessor. Entra no dashboard e confirma o teu número de WhatsApp.";
const REPLY_NON_TEXT =
  "Recebi a tua mensagem, mas nesta primeira versão só consigo processar texto.";

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
  // Try exact match first, then suffix match (last 9 digits) to tolerate stored formatting.
  const { data: exact } = await supabaseAdmin
    .from("profiles")
    .select("id, phone");
  if (!exact) return null;
  const matches = exact.filter((p: any) => {
    const n = normalizePhone(p.phone);
    if (!n) return false;
    return n === phone || n.endsWith(phone) || phone.endsWith(n);
  });
  if (matches.length === 1) return matches[0].id as string;
  return null;
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

  if (type !== "text") {
    // Persist a placeholder record so admin can see non-text volume.
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
    await replyAndStore(supabaseAdmin, senderPhone, userId, REPLY_NON_TEXT);
    return;
  }

  const body: string = msg?.text?.body ?? "";

  await supabaseAdmin.from("assessor_messages").insert({
    user_id: userId,
    role: "user",
    content: body,
    message_type: "whatsapp_text",
    status: "received",
    channel: "whatsapp",
    sender_phone: senderPhone,
    whatsapp_message_id: waMessageId,
  });

  const reply = userId ? REPLY_ASSOCIATED : REPLY_UNASSOCIATED;
  await replyAndStore(supabaseAdmin, senderPhone, userId, reply);
}

async function replyAndStore(
  supabaseAdmin: any,
  toPhone: string,
  userId: string | null,
  body: string,
) {
  const result = await sendWhatsAppText(toPhone, body);
  await supabaseAdmin.from("assessor_messages").insert({
    user_id: userId,
    role: "assistant",
    content: body,
    message_type: "whatsapp_text",
    status: result.ok ? "sent" : "failed",
    channel: "whatsapp",
    sender_phone: toPhone,
    whatsapp_message_id: result.ok ? result.messageId : null,
    structured_payload: result.ok ? null : ({ error: result.error } as any),
  });
}
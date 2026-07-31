// Server-only helper to send a WhatsApp text via the Meta Cloud API.
// Never import from client code. NEVER log the access token.

export type SendTelemetry = {
  ok: boolean;
  httpStatus: number | null;
  messageId: string | null;
  errorCode: number | null;
  errorSubcode: number | null;
  errorType: string | null;
  errorMessage: string | null;
  fbtraceId: string | null;
  phoneNumberId: string | null;
  to: string;
};

export type SendResult =
  | ({ ok: true; messageId: string | null } & { telemetry: SendTelemetry })
  | ({ ok: false; error: string } & { telemetry: SendTelemetry });

function sanitize(msg: string | null | undefined): string | null {
  if (!msg) return null;
  // Redact anything that looks like a bearer token or long opaque secret.
  return String(msg)
    .replace(/EAA[0-9A-Za-z_\-]{20,}/g, "[redacted-token]")
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

async function persistLog(entry: {
  telemetry: SendTelemetry;
  triggeredBy?: string | null;
  kind?: "auto" | "test";
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_send_logs" as never).insert({
      to_phone: entry.telemetry.to,
      phone_number_id: entry.telemetry.phoneNumberId,
      http_status: entry.telemetry.httpStatus,
      ok: entry.telemetry.ok,
      message_id: entry.telemetry.messageId,
      error_code: entry.telemetry.errorCode,
      error_subcode: entry.telemetry.errorSubcode,
      error_type: entry.telemetry.errorType,
      error_message: entry.telemetry.errorMessage,
      fbtrace_id: entry.telemetry.fbtraceId,
      triggered_by: entry.triggeredBy ?? null,
      kind: entry.kind ?? "auto",
    } as never);
  } catch (err) {
    console.error("[whatsapp-send] falha a gravar log:", err instanceof Error ? err.message : err);
  }
}

export async function sendWhatsAppText(
  to: string,
  body: string,
  opts: { triggeredBy?: string | null; kind?: "auto" | "test" } = {},
): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? null;
  // Formatação consistente: sintaxe WhatsApp (não Markdown), listas com "- ".
  const { formatForWhatsApp } = await import("@/lib/assessor/culture/whatsapp-format");
  const text = formatForWhatsApp(body) || body;

  const baseTelemetry: SendTelemetry = {
    ok: false,
    httpStatus: null,
    messageId: null,
    errorCode: null,
    errorSubcode: null,
    errorType: null,
    errorMessage: null,
    fbtraceId: null,
    phoneNumberId,
    to,
  };

  if (!token || !phoneNumberId) {
    const missing = [
      !token ? "WHATSAPP_ACCESS_TOKEN" : null,
      !phoneNumberId ? "WHATSAPP_PHONE_NUMBER_ID" : null,
    ].filter(Boolean).join(", ");
    const telemetry: SendTelemetry = {
      ...baseTelemetry,
      errorType: "config",
      errorMessage: `Credenciais WhatsApp em falta: ${missing}`,
    };
    console.error("[whatsapp-send] config incompleta:", missing);
    await persistLog({ telemetry, ...opts });
    return { ok: false, error: telemetry.errorMessage!, telemetry };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });
    const rawText = await res.text().catch(() => "");
    let json: any = {};
    try { json = rawText ? JSON.parse(rawText) : {}; } catch { json = {}; }

    if (!res.ok) {
      const err = json?.error ?? {};
      const telemetry: SendTelemetry = {
        ...baseTelemetry,
        httpStatus: res.status,
        errorCode: typeof err.code === "number" ? err.code : null,
        errorSubcode: typeof err.error_subcode === "number" ? err.error_subcode : null,
        errorType: err.type ?? null,
        errorMessage: sanitize(err.message ?? `HTTP ${res.status}`),
        fbtraceId: err.fbtrace_id ?? null,
      };
      console.error(
        "[whatsapp-send] Meta falhou",
        JSON.stringify({
          status: res.status,
          code: telemetry.errorCode,
          subcode: telemetry.errorSubcode,
          type: telemetry.errorType,
          message: telemetry.errorMessage,
          fbtrace_id: telemetry.fbtraceId,
          phone_number_id_suffix: phoneNumberId.slice(-4),
        }),
      );
      await persistLog({ telemetry, ...opts });
      return { ok: false, error: telemetry.errorMessage ?? `HTTP ${res.status}`, telemetry };
    }

    const messageId: string | null = json?.messages?.[0]?.id ?? null;
    const telemetry: SendTelemetry = {
      ...baseTelemetry,
      ok: true,
      httpStatus: res.status,
      messageId,
    };
    await persistLog({ telemetry, ...opts });
    return { ok: true, messageId, telemetry };
  } catch (err) {
    const msg = sanitize(err instanceof Error ? err.message : String(err));
    const telemetry: SendTelemetry = {
      ...baseTelemetry,
      errorType: "network",
      errorMessage: msg,
    };
    console.error("[whatsapp-send] erro de rede:", msg);
    await persistLog({ telemetry, ...opts });
    return { ok: false, error: msg ?? "network error", telemetry };
  }
}
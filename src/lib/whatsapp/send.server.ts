// Server-only helper to send a WhatsApp text via the Meta Cloud API.
// Never import from client code. NEVER log the access token.

import { buildDeliveryEvent, logDeliveryEvent, redactProviderText } from "@/lib/messaging/delivery-log";

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
  | ({ ok: true; messageId: string | null } & { telemetry: SendTelemetry; logId?: string | null })
  | ({ ok: false; error: string } & { telemetry: SendTelemetry; logId?: string | null });

function sanitize(msg: string | null | undefined): string | null {
  // Tokens, telefones, chat ids e emails nunca ficam no log.
  return redactProviderText(msg);
}

/** Contexto de custo/proatividade de um envio (fica no log para COGS). */
export interface SendMeta {
  purpose?: string | null;
  templateName?: string | null;
  templateCategory?: string | null;
  templateLanguage?: string | null;
  outsideWindow?: boolean | null;
  hoursSinceLastInbound?: number | null;
  testId?: string | null;
}

export type SendOpts = {
  triggeredBy?: string | null;
  kind?: "auto" | "test";
  meta?: SendMeta;
  /** Devolve o id da linha de log criada (usado pelos testes de proatividade). */
  returnLogId?: boolean;
};

async function persistLog(entry: {
  telemetry: SendTelemetry;
  triggeredBy?: string | null;
  kind?: "auto" | "test";
  meta?: SendMeta;
}): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const meta = entry.meta ?? {};
    const isTemplate = !!meta.templateName;

    // Custo: só sai valor quando existe tarifa registada para a categoria e
    // país. Sem tarifa fica a null — "por confirmar", nunca zero.
    let billable: boolean | null = null;
    let costEur: number | null = null;
    let costSource: string | null = null;
    try {
      const { priceSend } = await import("./pricing.server");
      const est = await priceSend(supabaseAdmin, {
        isTemplate,
        outsideWindow: meta.outsideWindow ?? null,
        category: meta.templateCategory ?? null,
        toPhone: entry.telemetry.to,
      });
      billable = est.billable;
      costEur = est.costEur;
      costSource = est.source;
    } catch { /* sem custo calculável */ }

    const { data } = await supabaseAdmin.from("whatsapp_send_logs" as never).insert({
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
      purpose: meta.purpose ?? null,
      template_name: meta.templateName ?? null,
      template_category: meta.templateCategory ?? null,
      template_language: meta.templateLanguage ?? null,
      outside_window: meta.outsideWindow ?? null,
      hours_since_last_inbound: meta.hoursSinceLastInbound ?? null,
      billable,
      cost_eur: costEur,
      cost_source: costSource,
      delivery_status: entry.telemetry.ok ? "sent" : "failed",
      test_id: meta.testId ?? null,
    } as never).select("id").maybeSingle();
    const logId = ((data as any)?.id as string) ?? null;
    logDeliveryEvent(
      buildDeliveryEvent({
        channel: "whatsapp",
        stage: entry.telemetry.ok ? "accepted" : "rejected",
        provider_message_id: entry.telemetry.messageId,
        log_id: logId,
        http_status: entry.telemetry.httpStatus,
        provider_code: entry.telemetry.errorCode,
        provider_subcode: entry.telemetry.errorSubcode,
        provider_title: entry.telemetry.errorType,
        provider_detail: entry.telemetry.errorMessage,
        purpose: meta.purpose ?? null,
        template: meta.templateName ?? null,
      }),
    );
    return logId;
  } catch (err) {
    console.error("[whatsapp-send] falha a gravar log:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function sendWhatsAppText(
  to: string,
  body: string,
  opts: SendOpts = {},
): Promise<SendResult> {
  // Formatação consistente: sintaxe WhatsApp (não Markdown), listas com "- ".
  const { formatForWhatsApp } = await import("@/lib/assessor/culture/whatsapp-format");
  const text = formatForWhatsApp(body) || body;
  return sendWhatsAppPayload(
    to,
    { type: "text", text: { preview_url: false, body: text } },
    opts,
  );
}

/**
 * Envio cru para a Cloud API (texto ou interativo). Partilha telemetria,
 * redacção de tokens e persistência de log com `sendWhatsAppText`.
 */
export async function sendWhatsAppPayload(
  to: string,
  payload: Record<string, unknown>,
  opts: SendOpts = {},
): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? null;

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
    const logId = await persistLog({ telemetry, ...opts });
    return { ok: false, error: telemetry.errorMessage!, telemetry, logId };
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
        ...payload,
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
      const logId = await persistLog({ telemetry, ...opts });
      return { ok: false, error: telemetry.errorMessage ?? `HTTP ${res.status}`, telemetry, logId };
    }

    const messageId: string | null = json?.messages?.[0]?.id ?? null;
    const telemetry: SendTelemetry = {
      ...baseTelemetry,
      ok: true,
      httpStatus: res.status,
      messageId,
    };
    const logId = await persistLog({ telemetry, ...opts });
    return { ok: true, messageId, telemetry, logId };
  } catch (err) {
    const msg = sanitize(err instanceof Error ? err.message : String(err));
    const telemetry: SendTelemetry = {
      ...baseTelemetry,
      errorType: "network",
      errorMessage: msg,
    };
    console.error("[whatsapp-send] erro de rede:", msg);
    const logId = await persistLog({ telemetry, ...opts });
    return { ok: false, error: msg ?? "network error", telemetry, logId };
  }
}
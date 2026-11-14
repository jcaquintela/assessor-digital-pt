// Registo estruturado e seguro do ciclo de vida de mensagens enviadas pelo
// Afonso (WhatsApp e Telegram).
//
// Estados distintos, nunca misturados:
//   accepted  — o fornecedor aceitou o pedido (HTTP 2xx + id da mensagem).
//               NÃO prova entrega.
//   rejected  — o fornecedor recusou o pedido de envio (nunca saiu).
//   sent      — callback da Meta: saiu para a rede do destinatário.
//   delivered — callback: chegou ao telemóvel.
//   read      — callback: foi lida.
//   failed    — callback: a Meta aceitou mas depois não conseguiu entregar.
//
// Correlação apenas por id da mensagem do fornecedor e id da linha de log.
// Nunca contém número de telefone, chat id, email, corpo da mensagem nem
// segredos: o texto de erro do fornecedor passa sempre por `redactProviderText`.

export type DeliveryChannel = "whatsapp" | "telegram";
export type DeliveryStage = "accepted" | "rejected" | "sent" | "delivered" | "read" | "failed";

export interface DeliveryEvent {
  evt: "message_delivery";
  channel: DeliveryChannel;
  stage: DeliveryStage;
  /** Quando o registo foi feito (UTC, ISO). */
  at: string;
  /** Hora indicada pelo fornecedor no callback (UTC, ISO), se houver. */
  provider_at: string | null;
  provider_message_id: string | null;
  log_id: string | null;
  http_status: number | null;
  provider_code: number | null;
  provider_subcode: number | null;
  provider_title: string | null;
  provider_detail: string | null;
  purpose: string | null;
  template: string | null;
}

const MAX_TEXT = 200;

/** Remove dados pessoais e segredos de um texto vindo do fornecedor. */
export function redactProviderText(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input);
  if (!s.trim()) return null;
  return s
    .replace(/EAA[0-9A-Za-z_\-]{20,}/g, "[token]")
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, "Bearer [token]")
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[email]")
    // Qualquer sequência de 6+ dígitos (telefones, chat ids), com ou sem +.
    .replace(/\+?\d[\d\s\-]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "[num]" : m))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

function toInt(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Converte um timestamp Unix (segundos) da Meta em ISO; null se inválido. */
export function providerTsToIso(ts: unknown): string | null {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

export interface ProviderError {
  code: number | null;
  subcode: number | null;
  title: string | null;
  detail: string | null;
}

/** Extrai o primeiro erro de um status da Meta (`errors[]`), já sanitizado. */
export function extractMetaStatusError(status: unknown): ProviderError | null {
  const errs = (status as any)?.errors;
  const e = Array.isArray(errs) ? errs[0] : null;
  if (!e || typeof e !== "object") return null;
  return {
    code: toInt(e.code),
    subcode: toInt(e.error_subcode ?? e.subcode),
    title: redactProviderText(e.title ?? e.message),
    detail: redactProviderText(e.error_data?.details ?? e.details ?? e.message),
  };
}

export function buildDeliveryEvent(
  input: Partial<Omit<DeliveryEvent, "evt" | "at">> & {
    channel: DeliveryChannel;
    stage: DeliveryStage;
    now?: Date;
  },
): DeliveryEvent {
  return {
    evt: "message_delivery",
    channel: input.channel,
    stage: input.stage,
    at: (input.now ?? new Date()).toISOString(),
    provider_at: input.provider_at ?? null,
    provider_message_id: input.provider_message_id ? String(input.provider_message_id).slice(0, 128) : null,
    log_id: input.log_id ?? null,
    http_status: toInt(input.http_status),
    provider_code: toInt(input.provider_code),
    provider_subcode: toInt(input.provider_subcode),
    provider_title: redactProviderText(input.provider_title),
    provider_detail: redactProviderText(input.provider_detail),
    purpose: input.purpose ? String(input.purpose).slice(0, 64) : null,
    template: input.template ? String(input.template).slice(0, 64) : null,
  };
}

/** Escreve uma linha JSON por evento. Falhas e recusas vão para stderr. */
export function logDeliveryEvent(ev: DeliveryEvent): void {
  try {
    const line = JSON.stringify(ev);
    if (ev.stage === "failed" || ev.stage === "rejected") console.error(line);
    else console.info(line);
  } catch {
    /* registo nunca pode partir um envio */
  }
}

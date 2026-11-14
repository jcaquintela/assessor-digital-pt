// Envio individual de convites do piloto — regras puras (sem base de dados).
//
// O Super Admin escolhe: código para partilha manual (caminho já existente) ou
// envio direto a uma pessoa registada e em espera, pelo canal confirmado.
// A vaga, os 7 dias, o uso único e o teto continuam decididos só pela base de
// dados (`issue_pilot_invite`). Aqui decide-se se e por onde se pode enviar.

export const PILOT_INVITE_DELIVERY_FLAG = "pilot.v2_invite_delivery.v1";
/** Sem resposta do envio durante este tempo, uma tentativa "a emitir" pode ser retomada. */
export const DELIVERY_ISSUING_STALE_MS = 5 * 60_000;
export const WHATSAPP_WINDOW_MS = 24 * 3600_000;
/** Chave em app_settings com o nome do template Meta aprovado (fora da janela de 24 h). */
export const PILOT_INVITE_TEMPLATE_SETTING = "pilot_invite_whatsapp_template";

export type DeliveryChannel = "whatsapp" | "telegram";
export type DeliveryStatus = "issuing" | "accepted" | "sent" | "delivered" | "read" | "failed" | "blocked";

export type DeliveryOutcome =
  | "accepted" | "sent" | "already_sent" | "in_flight" | "disabled" | "forbidden"
  | "not_eligible" | "already_participant" | "channel_unavailable" | "needs_template"
  | "cap_reached" | "not_open" | "send_failed" | "error" | "confirm_mismatch";

const RANK: Record<string, number> = { issuing: 0, accepted: 1, sent: 2, delivered: 3, read: 4 };

/** Estados de envio nunca recuam; "falhou" não apaga uma entrega já confirmada. */
export function nextDeliveryStatus(current: string, incoming: string): string | null {
  if (current === incoming) return null;
  if (incoming === "failed") return (RANK[current] ?? 0) >= 3 ? null : "failed";
  if (current === "failed" || current === "blocked") return null;
  if (!(incoming in RANK)) return null;
  return (RANK[incoming] ?? 0) > (RANK[current] ?? 0) ? incoming : null;
}

export type ExistingDelivery = { status: string; last_attempt_at: string; invite_status?: string | null; invite_expires_at?: string | null };

/** O que fazer com o registo de envio que já existe para esta pessoa. */
export function deliveryRetryVerdict(row: ExistingDelivery, nowMs = Date.now()): "retry" | "already_sent" | "in_flight" {
  if (row.status === "failed" || row.status === "blocked") return "retry";
  if (row.status === "issuing") {
    const at = new Date(row.last_attempt_at).getTime();
    return !Number.isFinite(at) || nowMs - at > DELIVERY_ISSUING_STALE_MS ? "retry" : "in_flight";
  }
  // Já saiu: só volta a enviar se aquele convite deixou de valer (expirou ou foi anulado).
  const expired = row.invite_expires_at ? new Date(row.invite_expires_at).getTime() <= nowMs : false;
  if (row.invite_status === "revoked" || (row.invite_status === "issued" && expired)) return "retry";
  return "already_sent";
}

export type ChannelFacts = {
  channel: DeliveryChannel;
  externalId: string | null;
  lastInboundAtMs: number | null;
  optIns: string[];
  templateName: string | null;
};

/** Pode enviar por este canal? WhatsApp: janela de 24 h aberta, ou template aprovado + consentimento. */
export function channelPermission(f: ChannelFacts, nowMs = Date.now()):
  { ok: true; mode: "free_text" | "template" } | { ok: false; outcome: "channel_unavailable" | "needs_template" } {
  if (!f.externalId) return { ok: false, outcome: "channel_unavailable" };
  if (f.channel === "telegram") return { ok: true, mode: "free_text" }; // só há chat se a pessoa iniciou o bot
  const inWindow = f.lastInboundAtMs != null && nowMs - f.lastInboundAtMs < WHATSAPP_WINDOW_MS;
  if (inWindow) return { ok: true, mode: "free_text" };
  if (f.templateName && f.optIns.includes("service_messages")) return { ok: true, mode: "template" };
  return { ok: false, outcome: "needs_template" };
}

export function pilotInviteDeliveryText(name: string | null, code: string, ttlDays: number): string {
  const hi = name ? `Olá ${name.split(" ")[0]}!` : "Olá!";
  return `${hi} Foste convidado para o piloto do Afonso 2.0. O teu código é ${code} e vale ${ttlDays} dias, uma única vez. Para entrares, responde aqui com o código.`;
}

/** Mostra só o fim do contacto, para confirmar sem expor o número. */
export function maskExternalId(channel: DeliveryChannel, id: string | null): string {
  if (!id) return "—";
  if (channel === "telegram") return "Telegram (conversa ligada)";
  const d = id.replace(/\D/g, "");
  return `WhatsApp ••• ${d.slice(-2)}`;
}

export const DELIVERY_OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  accepted: "Convite aceite pelo WhatsApp — ainda não confirmado como entregue.",
  sent: "Convite enviado pelo Telegram.",
  already_sent: "Esta pessoa já recebeu um convite válido. Nada foi reenviado.",
  in_flight: "Já há um envio a decorrer para esta pessoa. Tenta daqui a uns minutos.",
  disabled: "O envio automático de convites está desligado.",
  forbidden: "Não tens permissão para enviar convites do piloto.",
  not_eligible: "Esta pessoa não está registada e em espera.",
  already_participant: "Esta pessoa já participa no piloto.",
  channel_unavailable: "Esta pessoa não tem esse canal ligado.",
  needs_template: "Fora da janela de 24 h do WhatsApp: é preciso um template aprovado e consentimento.",
  cap_reached: "Não há vagas livres no piloto.",
  not_open: "O piloto ainda não está aberto a convites.",
  send_failed: "O envio falhou. O convite foi anulado e a vaga ficou livre.",
  error: "Não foi possível enviar. Nada foi consumido.",
  confirm_mismatch: "A confirmação não corresponde ao destinatário ou ao canal escolhidos.",
};

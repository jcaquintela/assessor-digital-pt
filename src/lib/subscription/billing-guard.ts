// Regras puras antes de aplicar um evento de pagamento:
//  1. Ambientes separados: só eventos `live` mexem em contas reais. Eventos de
//     teste (`sandbox`) só atuam em contas da lista de teste e nunca numa conta
//     já ligada a pagamentos reais.
//  2. Ordem: um evento mais antigo do que o último aplicado à conta é ignorado
//     (não repõe um estado antigo). Empate no mesmo segundo → reler o estado
//     atual da subscrição antes de aplicar.

export type StripeEnvName = "sandbox" | "live";

export type GuardProfile = {
  billing_source?: string | null;
  billing_environment?: string | null;
  billing_last_event_at?: string | null;
};

export type GuardInput = {
  env: StripeEnvName;
  eventType: string;
  eventCreatedMs: number | null;
  profile: GuardProfile | null;
  isTestAccount: boolean;
};

export type GuardResult = { ok: true; tie: boolean } | { ok: false; reason: string };

/** Eventos que mudam estado de subscrição e por isso respeitam a ordem. */
export function isOrderedEvent(type: string): boolean {
  return type.startsWith("customer.subscription.") || type === "invoice.payment_failed";
}

export function guardEvent(i: GuardInput): GuardResult {
  if (!i.profile) return { ok: true, tie: false }; // decideSync já ignora sem perfil
  if (i.env === "sandbox") {
    if (!i.isTestAccount) return { ok: false, reason: "evento de teste ignorado para conta real" };
    if (i.profile.billing_source === "stripe" && i.profile.billing_environment === "live")
      return { ok: false, reason: "evento de teste ignorado: conta com pagamentos reais" };
  }
  if (isOrderedEvent(i.eventType) && i.eventCreatedMs != null && i.profile.billing_last_event_at) {
    const last = new Date(i.profile.billing_last_event_at).getTime();
    if (Number.isFinite(last)) {
      if (i.eventCreatedMs < last) return { ok: false, reason: "out_of_order: evento mais antigo que o último aplicado" };
      if (i.eventCreatedMs === last) return { ok: true, tie: true };
    }
  }
  return { ok: true, tie: false };
}

/** Ambiente em que o servidor deixa abrir checkout/portal para esta conta. */
export function checkoutEnvProblem(
  requested: string,
  ctx: { liveConfigured: boolean; isTestAccount: boolean },
): string | null {
  if (requested === "live") return ctx.liveConfigured ? null : "Os pagamentos reais ainda não estão ativos.";
  if (requested === "sandbox") return ctx.isTestAccount ? null : "Pagamentos de teste não disponíveis para esta conta.";
  return "Ambiente de pagamentos inválido.";
}

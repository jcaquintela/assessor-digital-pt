// AFONSO 2.0 — referências (decisão 48). Puro; sem tabela nem crédito real ainda.
// 29 € de crédito na conta de quem refere, por cada novo subscritor pago
// elegível. Nunca dinheiro. Antifraude: sem autorreferência, sem contas
// ligadas pelo mesmo meio de pagamento/telefone, só após pagamento real
// (live) não reembolsado nem contestado, uma vez por pessoa referida.

export const REFERRAL_CREDIT_CENTS = 2900;
export const REFERRAL_PAYOUT_KIND = "account_credit" as const; // nunca "cash"

export interface ReferralCandidate {
  referrerId: string;
  referredId: string;
  referrerHasActiveSubscription: boolean;
  /** Primeira fatura paga do referido, em modo live. Null = ainda não pagou. */
  referredFirstPaidAt: string | null;
  paymentIsLiveMode: boolean;
  refundedOrDisputed: boolean;
  /** Já foi subscritor pago antes (não é novo). */
  referredWasSubscriberBefore: boolean;
  /** Já gerou crédito para alguém. */
  referredAlreadyCredited: boolean;
  /** Sinais partilhados (impressão digital do cartão, telefone verificado). */
  sharedPaymentFingerprint: boolean;
  sharedVerifiedPhone: boolean;
  /** Dias de retenção antes de creditar; valor a decidir pelo proprietário. */
  holdDays: number;
}

export type ReferralOutcome =
  | { eligible: true; creditCents: number; payout: typeof REFERRAL_PAYOUT_KIND; creditableFrom: string }
  | { eligible: false; reason: string };

export function evaluateReferral(c: ReferralCandidate, now: Date = new Date()): ReferralOutcome {
  if (c.referrerId === c.referredId) return { eligible: false, reason: "autorreferencia" };
  if (c.sharedPaymentFingerprint || c.sharedVerifiedPhone) return { eligible: false, reason: "contas_ligadas" };
  if (c.referredWasSubscriberBefore) return { eligible: false, reason: "nao_e_novo_subscritor" };
  if (c.referredAlreadyCredited) return { eligible: false, reason: "ja_creditado" };
  if (!c.referrerHasActiveSubscription) return { eligible: false, reason: "quem_refere_sem_subscricao" };
  if (!c.referredFirstPaidAt) return { eligible: false, reason: "ainda_sem_pagamento" };
  if (!c.paymentIsLiveMode) return { eligible: false, reason: "pagamento_de_teste" };
  if (c.refundedOrDisputed) return { eligible: false, reason: "reembolso_ou_disputa" };
  if (!(c.holdDays >= 0)) return { eligible: false, reason: "retencao_por_decidir" };
  const from = new Date(c.referredFirstPaidAt).getTime() + c.holdDays * 86_400_000;
  if (now.getTime() < from) return { eligible: false, reason: "em_retencao" };
  return { eligible: true, creditCents: REFERRAL_CREDIT_CENTS, payout: REFERRAL_PAYOUT_KIND, creditableFrom: new Date(from).toISOString() };
}

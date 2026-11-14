import { describe, it, expect } from "vitest";
import { evaluateReferral, REFERRAL_CREDIT_CENTS, type ReferralCandidate } from "./referrals";

const base: ReferralCandidate = {
  referrerId: "a", referredId: "b", referrerHasActiveSubscription: true,
  referredFirstPaidAt: "2026-11-01T00:00:00Z", paymentIsLiveMode: true, refundedOrDisputed: false,
  referredWasSubscriberBefore: false, referredAlreadyCredited: false,
  sharedPaymentFingerprint: false, sharedVerifiedPhone: false, holdDays: 14,
};
const now = new Date("2026-11-20T00:00:00Z");

describe("AFONSO 2.0 — referências", () => {
  it("novo subscritor pago elegível dá 29 € em crédito, nunca dinheiro", () => {
    const r = evaluateReferral(base, now);
    expect(r).toMatchObject({ eligible: true, creditCents: 2900, payout: "account_credit" });
    expect(REFERRAL_CREDIT_CENTS).toBe(2900);
  });

  it.each([
    [{ referredId: "a" }, "autorreferencia"],
    [{ sharedPaymentFingerprint: true }, "contas_ligadas"],
    [{ sharedVerifiedPhone: true }, "contas_ligadas"],
    [{ referredWasSubscriberBefore: true }, "nao_e_novo_subscritor"],
    [{ referredAlreadyCredited: true }, "ja_creditado"],
    [{ referredFirstPaidAt: null }, "ainda_sem_pagamento"],
    [{ paymentIsLiveMode: false }, "pagamento_de_teste"],
    [{ refundedOrDisputed: true }, "reembolso_ou_disputa"],
    [{ referrerHasActiveSubscription: false }, "quem_refere_sem_subscricao"],
  ] as const)("antifraude: %o → %s", (patch, reason) => {
    expect(evaluateReferral({ ...base, ...patch } as ReferralCandidate, now)).toEqual({ eligible: false, reason });
  });

  it("só credita depois do período de retenção", () => {
    expect(evaluateReferral(base, new Date("2026-11-14T23:00:00Z"))).toEqual({ eligible: false, reason: "em_retencao" });
  });
});

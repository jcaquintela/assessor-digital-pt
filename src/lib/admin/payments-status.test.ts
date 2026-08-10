import { describe, it, expect } from "vitest";
import {
  computeMrr,
  mrrCardText,
  paymentsStatusLabel,
  monthlyAmountForPrice,
  type PaymentsStatus,
} from "./payments-status";

const base: PaymentsStatus = {
  connected: true,
  environment: "sandbox",
  error: null,
  subscriptionsCount: 0,
  activeCount: 0,
  mrr: 0,
};

describe("estado de pagamentos", () => {
  it("ligado em teste sem subscrições não é 'não ligado'", () => {
    const label = paymentsStatusLabel(base);
    expect(label).toContain("Pagamentos ligados — modo de teste");
    expect(label).toContain("ainda sem subscrições");
    expect(label).not.toContain("não ligados");
  });

  it("cartão MRR mostra 0 € quando ligado sem subscrições ativas", () => {
    const card = mrrCardText(base);
    expect(card.value).toContain("0");
    expect(card.sub).toBe("sem subscrições ativas");
    expect(card.stale).toBe(false);
  });

  it("chave inválida = não ligado, com motivo", () => {
    const bad = { ...base, connected: false, environment: "none" as const, error: "Invalid API Key" };
    expect(paymentsStatusLabel(bad)).toBe("Pagamentos não ligados — Invalid API Key");
    expect(mrrCardText(bad)).toEqual({ value: "—", sub: "pagamentos não ligados", stale: true });
  });

  it("MRR soma mensais e anualiza os anuais", () => {
    expect(monthlyAmountForPrice("pro_monthly")).toBe(24.9);
    expect(
      computeMrr([
        { priceId: "pro_monthly", status: "active", source: "stripe" },
        { priceId: "consultor_yearly", status: "trialing", source: "stripe" },
        { priceId: "pro_monthly", status: "canceled", source: "stripe" },
        { priceId: "pro_monthly", status: "active", source: "manual" },
      ]),
    ).toBe(Math.round((24.9 + 160.9 / 12) * 100) / 100);
  });

  it("subscrição ativa aparece no cartão MRR", () => {
    const card = mrrCardText({ ...base, subscriptionsCount: 1, activeCount: 1, mrr: 24.9 });
    expect(card.value).toContain("24,90");
    expect(card.sub).toContain("1 subscrição");
  });
});
import { describe, it, expect } from "vitest";
import { resolveV2Access, shouldStartTrial, earliestPriceChangeAt, V2_PLAN } from "./subscription-lifecycle";

const at = (s: string) => new Date(s);

describe("AFONSO 2.0 — ciclo de vida da subscrição", () => {
  it("plano único de 29 €/mês", () => {
    expect(V2_PLAN.priceEurMonthly).toBe(29);
    expect(V2_PLAN.interval).toBe("month");
  });

  it("trial de 14 dias dá acesso completo; ao expirar restringe funções comerciais", () => {
    const s = { kind: "trialing" as const, trialStartedAt: "2026-11-01T10:00:00Z" };
    expect(resolveV2Access(s, at("2026-11-15T09:59:00Z")).commercial).toBe(true);
    const after = resolveV2Access(s, at("2026-11-15T10:00:00Z"));
    expect(after.access).toBe("restricted");
    expect(after.commercial).toBe(false);
    expect(after.canExport).toBe(true);
  });

  it("falha de pagamento: 7 dias de tolerância com acesso completo, depois restringe", () => {
    const s = { kind: "past_due" as const, firstFailedAt: "2026-11-01T00:00:00Z", currentPeriodEnd: "2026-11-01T00:00:00Z" };
    expect(resolveV2Access(s, at("2026-11-07T23:59:00Z")).access).toBe("full");
    expect(resolveV2Access(s, at("2026-11-08T00:00:00Z")).access).toBe("restricted");
  });

  it("cancelamento mantém acesso até ao fim do período pago", () => {
    const s = { kind: "active" as const, currentPeriodEnd: "2026-12-01T00:00:00Z", cancelAtPeriodEnd: true };
    expect(resolveV2Access(s, at("2026-11-30T23:00:00Z")).access).toBe("full");
    expect(resolveV2Access(s, at("2026-12-02T00:00:00Z")).access).toBe("export_only");
  });

  it("exportação disponível 30 dias após o fim, depois termina", () => {
    const s = { kind: "ended" as const, endedAt: "2026-12-01T00:00:00Z" };
    expect(resolveV2Access(s, at("2026-12-30T23:59:00Z")).canExport).toBe(true);
    const late = resolveV2Access(s, at("2026-12-31T00:00:00Z"));
    expect(late.canExport).toBe(false);
    expect(late.canSubscribe).toBe(true); // reativação continua possível
  });

  it("trial só começa na 1.ª ação comercial útil após ativação, uma vez por conta", () => {
    expect(shouldStartTrial({ state: "activated", trialAlreadyUsed: false, firstUsefulCommercialAction: true })).toBe(true);
    expect(shouldStartTrial({ state: "activated", trialAlreadyUsed: false, firstUsefulCommercialAction: false })).toBe(false);
    expect(shouldStartTrial({ state: "registered", trialAlreadyUsed: false, firstUsefulCommercialAction: true })).toBe(false);
    expect(shouldStartTrial({ state: "activated", trialAlreadyUsed: true, firstUsefulCommercialAction: true })).toBe(false);
  });

  it("mudança de preço respeita o tempo já pago e o aviso prévio", () => {
    // Período termina a 20/11, aviso a 14/11 com 30 dias → só na renovação de 20/12.
    expect(earliestPriceChangeAt({ currentPeriodEnd: "2026-11-20T00:00:00Z", noticeSentAt: "2026-11-14T00:00:00Z", noticeDays: 30 }))
      .toBe("2026-12-20T00:00:00.000Z");
    expect(() => earliestPriceChangeAt({ currentPeriodEnd: "2026-11-20T00:00:00Z", noticeSentAt: "2026-11-14T00:00:00Z", noticeDays: 0 })).toThrow();
  });
});

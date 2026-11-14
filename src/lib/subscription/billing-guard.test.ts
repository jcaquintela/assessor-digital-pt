import { describe, it, expect } from "vitest";
import { checkoutEnvProblem, guardEvent } from "./billing-guard";
import { checkoutGateProblem, onRequestTiers, sellablePriceIds } from "./checkout-policy";

const CONFIGS = [
  { tier: "base", status: "published", pricing_mode: "paid" },
  { tier: "consultor", status: "published", pricing_mode: "paid" },
  { tier: "pro", status: "published", pricing_mode: "paid" },
  { tier: "hub", status: "published", pricing_mode: "on_request" },
];

describe("checkout seguro", () => {
  it("checkout de teste recusado para conta real; aceite para conta de teste", () => {
    expect(checkoutEnvProblem("sandbox", { liveConfigured: false, isTestAccount: false })).not.toBeNull();
    expect(checkoutEnvProblem("sandbox", { liveConfigured: false, isTestAccount: true })).toBeNull();
  });
  it("checkout real só depois de os pagamentos reais estarem ativos", () => {
    expect(checkoutEnvProblem("live", { liveConfigured: false, isTestAccount: true })).not.toBeNull();
    expect(checkoutEnvProblem("live", { liveConfigured: true, isTestAccount: false })).toBeNull();
    expect(checkoutEnvProblem("prod", { liveConfigured: true, isTestAccount: true })).not.toBeNull();
  });
  it("interruptor desligado recusa checkout novo, exceto teste em conta de teste", () => {
    expect(checkoutGateProblem({ flagOn: false, env: "live", isTestAccount: false })).not.toBeNull();
    expect(checkoutGateProblem({ flagOn: false, env: "live", isTestAccount: true })).not.toBeNull();
    expect(checkoutGateProblem({ flagOn: false, env: "sandbox", isTestAccount: true })).toBeNull();
    expect(checkoutGateProblem({ flagOn: true, env: "live", isTestAccount: false })).toBeNull();
  });
  it("Team/Hub sob consulta nunca tem checkout", () => {
    const ids = sellablePriceIds(CONFIGS);
    expect(ids).toEqual(["consultor_monthly", "consultor_yearly", "pro_monthly", "pro_yearly"]);
    expect(ids).not.toContain("team_monthly");
    expect(onRequestTiers(CONFIGS)).toEqual(["hub"]);
  });
  it("plano despublicado deixa de ter checkout", () => {
    const ids = sellablePriceIds(CONFIGS.map((c) => (c.tier === "pro" ? { ...c, status: "draft" } : c)));
    expect(ids).not.toContain("pro_monthly");
  });
});

describe("guarda de eventos", () => {
  const real = { billing_source: "stripe", billing_environment: "sandbox", billing_last_event_at: null };
  it("teste em conta real → ignorado", () => {
    expect(guardEvent({ env: "sandbox", eventType: "customer.subscription.updated", eventCreatedMs: 1, profile: real, isTestAccount: false }).ok).toBe(false);
  });
  it("live passa sempre (salvo ordem)", () => {
    expect(guardEvent({ env: "live", eventType: "customer.subscription.updated", eventCreatedMs: 1, profile: real, isTestAccount: false }).ok).toBe(true);
  });
  it("checkout concluído não está sujeito à ordem", () => {
    const p = { ...real, billing_last_event_at: new Date(10_000).toISOString() };
    expect(guardEvent({ env: "live", eventType: "checkout.session.completed", eventCreatedMs: 1, profile: p, isTestAccount: false }).ok).toBe(true);
  });
});

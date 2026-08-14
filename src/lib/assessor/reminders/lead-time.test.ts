import { describe, expect, it } from "vitest";
import { applyLead, resolveLeadMinutes } from "./lead-time";

describe("antecedência dos lembretes", () => {
  it("sem configuração nenhuma mantém o comportamento actual (0)", () => {
    expect(resolveLeadMinutes(null, null)).toBe(0);
  });
  it("usa o valor global quando o consultor não definiu", () => {
    expect(resolveLeadMinutes(null, 15)).toBe(15);
  });
  it("o valor do consultor manda sobre o global", () => {
    expect(resolveLeadMinutes(30, 15)).toBe(30);
  });
  it("consultor pode voltar a 0 mesmo com global definido", () => {
    expect(resolveLeadMinutes(0, 15)).toBe(0);
  });
  it("ignora valores absurdos", () => {
    expect(resolveLeadMinutes(-5, 999)).toBe(0);
  });
  it("desloca o instante para trás", () => {
    expect(applyLead("2026-08-14T09:00:00.000Z", 15)).toBe("2026-08-14T08:45:00.000Z");
    expect(applyLead("2026-08-14T09:00:00.000Z", 0)).toBe("2026-08-14T09:00:00.000Z");
  });
});

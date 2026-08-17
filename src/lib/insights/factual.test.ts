import { describe, it, expect } from "vitest";
import { applyProInsight, factualInsight, stalledFacts, type InsightConfig } from "./factual";

const CFG: InsightConfig = {
  key: "imoveis-parados",
  noun: ["imóvel", "imóveis"],
  movimento: "última interação ou seguimento fechado ligado ao imóvel",
  linkLabel: "Ver imóveis →",
  to: "/imoveis",
};

const item = (id: string, days: number) => ({ id, label: `Imóvel ${id}`, days });

describe("factos de paragem", () => {
  it("conta só o que passa a régua e guarda o mais parado", () => {
    const f = stalledFacts([item("a", 20), item("b", 3), item("c", 16)], 15);
    expect(f.parados).toBe(2);
    expect(f.total).toBe(3);
    expect(f.dias).toBe(20);
    expect(f.exemplo!.id).toBe("a");
  });

  it("régua é inclusive", () => {
    expect(stalledFacts([item("a", 15)], 15).parados).toBe(1);
    expect(stalledFacts([item("a", 14)], 15).parados).toBe(0);
  });
});

describe("frase factual", () => {
  it("cala-se quando não há nada parado", () => {
    expect(factualInsight(stalledFacts([item("a", 2)], 15), CFG)).toBeNull();
    expect(factualInsight(stalledFacts([], 15), CFG)).toBeNull();
  });

  it("diz o número, o total e um caso concreto", () => {
    const i = factualInsight(stalledFacts([item("a", 20), item("c", 16)], 15), CFG)!;
    expect(i.text).toContain("2 imóveis sem movimento há mais de 15 dias");
    expect(i.text).toContain("de 2 no total");
    expect(i.text).toContain("há 20 dias");
    expect(i.text.trim().endsWith("?")).toBe(true);
  });

  it("nunca prevê nem julga", () => {
    const i = factualInsight(stalledFacts([item("a", 30)], 15), CFG)!;
    expect(i.text.toLowerCase()).not.toMatch(/vais|provavel|risco de perder|devias|falhaste/);
    expect(i.reason).toContain("sem previsões");
  });

  it("singular e plural corretos", () => {
    expect(factualInsight(stalledFacts([item("a", 30)], 15), CFG)!.text).toContain("1 imóvel sem movimento");
  });
});

describe("gate Pro (effective_tier)", () => {
  const i = factualInsight(stalledFacts([item("a", 30)], 15), CFG);
  it("base e consultor não veem análise proativa", () => {
    expect(applyProInsight(i, "base")).toBeNull();
    expect(applyProInsight(i, "consultor")).toBeNull();
    expect(applyProInsight(i, null)).toBeNull();
  });
  it("pro e hub veem", () => {
    expect(applyProInsight(i, "pro")).not.toBeNull();
    expect(applyProInsight(i, "hub")).not.toBeNull();
  });
  it("sem factos, nem o Pro vê ruído", () => {
    expect(applyProInsight(null, "pro")).toBeNull();
  });
});
import { describe, it, expect } from "vitest";
import { CARD_COLUMNS, dealGroupCards } from "./board-cards";

describe("cartões canónicos de Negócios", () => {
  it("1 concluído e 0 ativos: o cartão Concluído aparece com 1, os outros a 0", () => {
    const cards = dealGroupCards([{ stage: "concluido" }]);
    expect(cards.map((c) => c.key)).toEqual(CARD_COLUMNS.map((c) => c.key));
    expect(cards.find((c) => c.key === "concluido")!.count).toBe(1);
    for (const c of cards.filter((c) => c.key !== "concluido")) expect(c.count).toBe(0);
  });

  it("um negócio fechado nunca fica sem cartão que o represente", () => {
    const cards = dealGroupCards([{ stage: "concluido" }, { stage: "perdido" }]);
    expect(cards.find((c) => c.key === "concluido")!.items).toHaveLength(1);
    expect(cards.find((c) => c.key === "perdido")!.items).toHaveLength(1);
  });

  it("negócios em curso caem no grupo da fase", () => {
    const cards = dealGroupCards([{ stage: "visitas" }, { stage: "proposta" }, { stage: "concluido" }]);
    expect(cards.find((c) => c.key === "mercado")!.count).toBe(1);
    expect(cards.find((c) => c.key === "negociacao")!.count).toBe(1);
    expect(cards.reduce((n, c) => n + c.count, 0)).toBe(3);
  });
});

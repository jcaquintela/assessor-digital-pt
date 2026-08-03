import { describe, it, expect } from "vitest";
import { extractPropertyHint, textMatchesHint, dealTitleFromHint } from "./property-hint";

describe("imóvel descrito no texto", () => {
  it("apanha o tipo mesmo sem registo criado", () => {
    const h = extractPropertyHint("fechei a comissão do terreno, 5.000€");
    expect(h?.type).toBe("terreno");
    expect(h?.location).toBeNull();
  });

  it("apanha tipo + localidade", () => {
    const h = extractPropertyHint("visita ao terreno de Canelas amanhã às 15h");
    expect(h?.type).toBe("terreno");
    expect(h?.location).toBe("canelas");
    expect(dealTitleFromHint(h!)).toContain("Terreno em canelas");
  });

  it("liga a visita e a comissão ao mesmo imóvel", () => {
    const hint = extractPropertyHint("comissão do terreno de Canelas")!;
    expect(textMatchesHint("Visita ao terreno em Canelas com o Sr. Rui", hint)).toBe(true);
    expect(textMatchesHint("Visita à moradia de Gaia", hint)).toBe(false);
  });

  it("ignora texto sem imóvel", () => {
    expect(extractPropertyHint("liga ao Paulo amanhã")).toBeNull();
  });
});
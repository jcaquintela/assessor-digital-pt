import { describe, expect, it } from "vitest";
import { sameDealScope, validateDealMinimum } from "./rules";

describe("regra mínima do negócio", () => {
  it("recusa negócio sem pessoa nem imóvel", () => {
    const r = validateDealMinimum({ title: "Venda", kind: "venda" });
    expect(r.ok).toBe(false);
  });

  it("recusa negócio sem objetivo nem tipo explícito", () => {
    const r = validateDealMinimum({ title: "  ?  ", kind: null, personId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/objetivo/i);
  });

  it("constrói o título a partir do tipo e do contexto", () => {
    const r = validateDealMinimum({ kind: "angariacao", personId: "p1" }, { personName: "Ana Silva" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.title).toContain("Ana Silva");
  });

  it("aceita negócio só com imóvel", () => {
    const r = validateDealMinimum({ title: "Venda do T3", propertyId: "im1" });
    expect(r.ok).toBe(true);
  });
});

describe("dedupe por âmbito", () => {
  it("mesmo imóvel é o mesmo negócio", () => {
    expect(sameDealScope({ propertyId: "a" }, { propertyId: "a", personId: "x" })).toBe(true);
  });
  it("imóveis diferentes não são o mesmo negócio", () => {
    expect(sameDealScope({ propertyId: "a" }, { propertyId: "b" })).toBe(false);
  });
  it("mesma pessoa sem imóvel só colide com o mesmo objetivo", () => {
    expect(sameDealScope({ personId: "p", kind: "venda" }, { personId: "p", kind: "venda" })).toBe(true);
    expect(sameDealScope({ personId: "p", kind: "venda" }, { personId: "p", kind: "arrendamento" })).toBe(false);
  });
});

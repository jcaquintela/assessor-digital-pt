import { describe, it, expect } from "vitest";
import { foldText, foldLike, foldIncludes } from "@/lib/search/normalize";

describe("pesquisa sem acentos", () => {
  it("golden: variante sem acentos encontra o registo", () => {
    expect(foldText("Sérgio Canelas")).toBe("sergio canelas");
    expect(foldIncludes("Sérgio Canelas", "sergio")).toBe(true);
    expect(foldIncludes("Sergio Canelas", "sérgio")).toBe(true);
    expect(foldIncludes("Moradia na Praça São João", "praca sao joao")).toBe(true);
  });
  it("não alarga a pesquisa a quem não corresponde", () => {
    expect(foldIncludes("Ana Costa", "sergio")).toBe(false);
  });
  it("limpa wildcards no termo de ilike", () => {
    expect(foldLike("Sé%rgio_")).toBe("sergio");
  });
});

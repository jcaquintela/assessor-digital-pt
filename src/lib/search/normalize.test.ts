import { describe, it, expect } from "vitest";
import { foldText, foldLike, foldIncludes, tokenMatchScore, compareTokenMatches } from "@/lib/search/normalize";

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

describe("ordenação estável com empates", () => {
  it("empate devolve 0 (a ordem de entrada mantém-se)", () => {
    const a = tokenMatchScore("Sérgio Canelas", ["sergio", "can"]);
    const b = tokenMatchScore("Sergio Canelas", ["sergio", "can"]);
    expect(compareTokenMatches(a, b)).toBe(0);
  });

  it("ordenar duas vezes não muda nada quando há empates", () => {
    const tokens = ["sergio", "can"];
    const nomes = ["a", "b", "c", "d", "e"].map((id) => ({ id, nome: "Sérgio Canelas" }));
    const ordenar = (xs: typeof nomes) =>
      [...xs].sort((x, y) => compareTokenMatches(tokenMatchScore(x.nome, tokens), tokenMatchScore(y.nome, tokens)))
        .map((x) => x.id);
    expect(ordenar(nomes)).toEqual(["a", "b", "c", "d", "e"]);
    expect(ordenar(nomes)).toEqual(ordenar(nomes));
  });
});

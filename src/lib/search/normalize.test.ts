import { describe, it, expect } from "vitest";
import {
  foldText, foldLike, foldIncludes, tokenMatchScore, compareTokenMatches,
  fuzzyMaxEdits, fuzzyTokenHit, filterByRelevance, weightedTokenMatchScore, FUZZY_CREDIT,
} from "@/lib/search/normalize";

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

describe("limiar do fuzzy", () => {
  it("palavras curtas não toleram erros ('sol' nunca casa 'sal')", () => {
    expect(fuzzyMaxEdits(3)).toBe(0);
    expect(fuzzyMaxEdits(4)).toBe(0);
    expect(fuzzyTokenHit("Rua do Sal", "sol")).toBe(0);
  });

  it("palavras médias toleram uma gralha, longas duas", () => {
    expect(fuzzyMaxEdits(6)).toBe(1);
    expect(fuzzyMaxEdits(10)).toBe(2);
    expect(fuzzyTokenHit("Sérgio Canelas", "canelaz")).toBe(FUZZY_CREDIT);
    expect(fuzzyTokenHit("Matosinhos", "matozinhoz")).toBe(FUZZY_CREDIT);
  });

  it("uma gralha não vale tanto como a palavra certa", () => {
    expect(fuzzyTokenHit("Sérgio Canelas", "canelas")).toBe(1);
    expect(FUZZY_CREDIT).toBeLessThan(1);
  });

  it("diferenças grandes continuam a não casar", () => {
    expect(fuzzyTokenHit("Sérgio Canelas", "nogueira")).toBe(0);
    expect(fuzzyTokenHit("Braga", "matosinhos")).toBe(0);
  });

  it("pontuação ponderada: gralha casa mas fica abaixo do exacto", () => {
    const certo = weightedTokenMatchScore([{ text: "Sérgio Canelas", weight: 1 }], ["canelas"]);
    const gralha = weightedTokenMatchScore([{ text: "Sérgio Canelas", weight: 1 }], ["canelaz"]);
    expect(gralha.hits).toBeGreaterThan(0);
    expect(gralha.hits).toBeLessThan(certo.hits);
  });

  it("corte de relevância deixa cair o ruído e mantém empates", () => {
    const rows = [{ score: 2 }, { score: 1 }, { score: 0.4 }];
    expect(filterByRelevance(rows)).toEqual([{ score: 2 }, { score: 1 }]);
    expect(filterByRelevance([{ score: 1 }, { score: 1 }])).toHaveLength(2);
  });
});

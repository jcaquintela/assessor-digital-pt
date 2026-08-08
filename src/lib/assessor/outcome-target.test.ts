import { describe, it, expect } from "vitest";
import { extractExplicitNames, decideOutcomeTarget } from "./outcome-target";

const nudge = { id: "nudge", title: "Reunião de equipa" };
const coelho = { id: "c1", title: "Visita Alameda da República", personName: "Sr. Coelho" };

describe("nomes próprios explícitos", () => {
  it("apanha tratamento + apelido", () => {
    expect(extractExplicitNames("O Sr. Coelho desistiu de tudo")).toContain("Coelho");
  });
  it("apanha nome solto no meio da frase", () => {
    expect(extractExplicitNames("A Ana Silva desistiu")).toContain("Ana Silva");
  });
  it("não inventa nomes em frases genéricas", () => {
    expect(extractExplicitNames("fica sem efeito")).toEqual([]);
    expect(extractExplicitNames("Já liguei, está tratado")).toEqual([]);
  });
});

describe("bug real (08/08) — nome explícito manda sobre o nudge pendente", () => {
  it("'O Sr. Coelho desistiu de tudo' resolve para o Sr. Coelho, não para o nudge", () => {
    const d = decideOutcomeTarget({
      text: "O Sr. Coelho desistiu de tudo",
      pending: nudge,
      candidates: [coelho],
    });
    expect(d).toEqual({ kind: "apply", target: coelho });
  });

  it("nome explícito sem correspondência nunca cai no nudge", () => {
    expect(
      decideOutcomeTarget({ text: "O Sr. Coelho desistiu de tudo", pending: nudge, candidates: [] }),
    ).toEqual({ kind: "none" });
  });

  it("ambiguidade real → pergunta, não age", () => {
    const d = decideOutcomeTarget({
      text: "O Coelho desistiu",
      pending: null,
      candidates: [coelho, { id: "c2", title: "Angariação Coelho - Porto" }],
    });
    expect(d.kind).toBe("ask");
  });

  it("sem nome explícito continua a usar o pendente", () => {
    expect(decideOutcomeTarget({ text: "fica sem efeito", pending: nudge, candidates: [] }))
      .toEqual({ kind: "apply", target: nudge });
  });
});

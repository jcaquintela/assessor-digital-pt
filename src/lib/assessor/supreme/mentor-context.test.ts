import { describe, it, expect } from "vitest";
import {
  emptyFacts,
  mentorContextLine,
  mentorReinforcement,
  sinalCrescimento,
  sinalProdutividade,
  type MentorFacts,
} from "./mentor-context";

const facts = (over: Partial<MentorFacts> = {}): MentorFacts => ({ ...emptyFacts(), ...over });

/** Palavras de juízo que o mentor nunca usa. */
const JUIZO = ["não estás", "falhaste", "falha", "devias ter", "insuficiente", "fraco"];
function semJuizo(texto: string) {
  const t = texto.toLowerCase();
  for (const p of JUIZO) expect(t).not.toContain(p);
}

describe("mentor nível 2 — Crescimento vs. Produtividade", () => {
  it("0 leads novas e 6 seguimentos fechados: reconhece os dois sinais, sem juízo", () => {
    const linha = mentorContextLine(facts({ leadsSemana: 0, seguimentosFechados: 6 }))!;
    expect(linha).toContain("baixo Crescimento");
    expect(linha).toContain("Produtividade está sólida");
    expect(linha).toContain("6 seguimentos fechados");
    expect(linha.trimEnd().endsWith("?")).toBe(true);
    semJuizo(linha);
  });

  it("imóvel único no estado e sem negócio ligado: menciona ambos", () => {
    const linha = mentorContextLine(
      facts({ total: 1, unicoNoEstado: true, semNegocioLigado: true, diasSemContacto: 17, seguimentosFechados: 1 }),
    )!;
    expect(linha).toContain("é o único nesse estado".slice(2)); // "o único nesse estado"
    expect(linha).toContain("sem nenhum negócio ligado");
    expect(linha).toContain("17 dias sem contacto");
    semJuizo(linha);
  });

  it("vários no mesmo estado: dá a posição relativa em vez de 'único'", () => {
    const linha = mentorContextLine(facts({ total: 4, unicoNoEstado: false }))!;
    expect(linha).toContain("são 4 no mesmo estado".slice(2));
    expect(linha).not.toContain("único");
  });

  it("semana com os dois sinais bons: o mentor reforça em vez de ficar em silêncio", () => {
    const r = mentorReinforcement(facts({ leadsSemana: 3, seguimentosFechados: 2, negociosMovidos: 2 }))!;
    expect(r).not.toBeNull();
    expect(r.key).toBe("semana-equilibrada");
    expect(r.text).toContain("Crescimento");
    expect(r.text).toContain("Produtividade");
    semJuizo(r.text);
  });

  it("não reforça quando algum dos sinais não está bom", () => {
    expect(mentorReinforcement(facts({ leadsSemana: 0, seguimentosFechados: 9 }))).toBeNull();
    expect(mentorReinforcement(facts({ leadsSemana: 5, seguimentosFechados: 0, negociosMovidos: 0 }))).toBeNull();
  });

  it("semana calma nos dois eixos continua sem culpar ninguém", () => {
    const linha = mentorContextLine(facts({ leadsSemana: 0, seguimentosFechados: 0, negociosMovidos: 0 }))!;
    expect(linha).toContain("semana calma");
    semJuizo(linha);
  });

  it("limiares dos sinais", () => {
    expect(sinalCrescimento(facts({ leadsSemana: 0 }))).toBe("baixo");
    expect(sinalCrescimento(facts({ leadsSemana: 1 }))).toBe("morno");
    expect(sinalCrescimento(facts({ leadsSemana: 2 }))).toBe("bom");
    expect(sinalProdutividade(facts({ seguimentosFechados: 0 }))).toBe("baixo");
    expect(sinalProdutividade(facts({ seguimentosFechados: 1 }))).toBe("morno");
    expect(sinalProdutividade(facts({ seguimentosFechados: 2, negociosMovidos: 1 }))).toBe("bom");
  });
});
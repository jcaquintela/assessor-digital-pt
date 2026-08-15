import { describe, it, expect } from "vitest";
import {
  emptyFacts,
  applyMentorLevel,
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

describe("níveis por plano — sem gate de acesso", () => {
  const tip = {
    key: "imoveis-parados",
    text: "Tens 1 imóvel \"Por angariar\" há mais de 10 dias.",
    linkLabel: "Ver o imóvel →",
    to: "/imoveis",
    reason: "limiar de 10 dias.",
  };
  const dados = facts({ total: 1, unicoNoEstado: true, semNegocioLigado: true, leadsSemana: 0, seguimentosFechados: 6 });

  it("Base vê sempre o nível 1, com os mesmos dados de um Consultor", () => {
    const r = applyMentorLevel(tip, dados, "base")!;
    expect(r.text).toBe(tip.text);       // o Mentor continua visível
    expect(r.context).toBeNull();        // mas sem linha contextual
    expect(r.facts).toBeUndefined();
  });

  it("Consultor e Pro veem nível 1 + linha contextual", () => {
    for (const tier of ["consultor", "pro", "hub"]) {
      const r = applyMentorLevel(tip, dados, tier)!;
      expect(r.text).toBe(tip.text);
      expect(r.context).toContain("Crescimento");
      expect(r.context).toContain("o único nesse estado");
    }
  });

  it("sem padrão a corrigir: Base fica em silêncio, Consultor reforça a semana boa", () => {
    const boa = facts({ leadsSemana: 3, seguimentosFechados: 4 });
    expect(applyMentorLevel(null, boa, "base")).toBeNull();
    expect(applyMentorLevel(null, boa, "consultor")?.key).toBe("semana-equilibrada");
  });

  // O teste que faltava: comparar a SAÍDA REAL lado a lado para os mesmos dados.
  it("mesma entrada, saída visivelmente diferente entre base e consultor", () => {
    const base = applyMentorLevel(tip, dados, "base")!;
    const cons = applyMentorLevel(tip, dados, "consultor")!;
    const render = (r: typeof base) => [r.text, r.context ?? ""].join(" ").trim();
    expect(render(base)).not.toBe(render(cons));
    expect(render(base)).not.toMatch(/Crescimento|Produtividade/);
    expect(render(cons)).toMatch(/Crescimento/);
    expect(render(cons)).toMatch(/Produtividade/);
    expect(render(cons).length).toBeGreaterThan(render(base).length);
  });
});
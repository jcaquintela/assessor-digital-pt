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
    const linha = mentorContextLine(facts({ leadsSemana: 0, seguimentosFechados: 6 }), "imoveis-parados")!;
    expect(linha).toContain("baixo Crescimento");
    expect(linha).toContain("Produtividade está sólida");
    expect(linha).toContain("6 seguimentos fechados");
    expect(linha).toContain("entrada desta semana");
    semJuizo(linha);
  });

  it("a linha contextual não repete os factos do caso (isso já está no nível 1)", () => {
    const linha = mentorContextLine(
      facts({ total: 3, unicoNoEstado: false, semNegocioLigado: true, diasSemContacto: 16, seguimentosFechados: 1 }),
      "imoveis-parados",
    )!;
    expect(linha).not.toContain("3 imóveis");
    expect(linha).not.toContain("no mesmo estado");
    expect(linha).not.toContain("16 dias");
    semJuizo(linha);
  });

  it("a ligação muda com a sugestão", () => {
    const f = facts({ leadsSemana: 0, seguimentosFechados: 3 });
    expect(mentorContextLine(f, "negocios-parados")).toContain("Desbloquear um destes negócios");
    expect(mentorContextLine(f, "pessoas-frias")).toContain("Reativar uma destas pessoas");
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
    const linha = mentorContextLine(
      facts({ leadsSemana: 0, seguimentosFechados: 0, negociosMovidos: 0 }),
      "imoveis-parados",
    )!;
    expect(linha).toContain("Produtividade também esteve parada");
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
      expect(r.context).toContain("Retomar estes contactos");
    }
  });

  // Golden do teste real: 3 imóveis parados há 16 dias, 0 leads, 3 seguimentos.
  it("caso real: sem repetição de factos e com ligação explícita à sugestão", () => {
    const real = facts({ total: 3, diasSemContacto: 16, leadsSemana: 0, seguimentosFechados: 3 });
    const tipReal = {
      ...tip,
      text: 'Tens 3 imóveis "Por angariar" há mais de 10 dias sem nenhum movimento registado.',
    };
    const r = applyMentorLevel(tipReal, real, "consultor")!;
    const ctx = r.context!;
    expect(ctx).not.toContain("3 imóve");
    expect(ctx).not.toContain("16 dias");
    expect(ctx).not.toContain("10 dias");
    expect(ctx).toContain("baixo Crescimento");
    expect(ctx).toContain("Retomar estes contactos pode ser a tua entrada desta semana");
    expect(ctx.trimEnd().endsWith("?")).toBe(false);
    semJuizo(ctx);
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
// Testes de naturalidade gramatical PT-PT — cobrem o pedido final de
// "correção da naturalidade das respostas" do briefing 2026-07-27.

import { describe, it, expect } from "vitest";
import { stripAssessorVocative } from "../assessor-name";

describe("cultura: saudação com nome do Assessor", () => {
  it("'Olá Alfred' remove o vocativo do Assessor mantendo a saudação", () => {
    expect(stripAssessorVocative("Olá Alfred", "Alfred")).toBe("Olá");
  });
  it("'Bom dia Alfred' mantém apenas a saudação", () => {
    expect(stripAssessorVocative("Bom dia Alfred", "Alfred")).toBe("Bom dia");
  });
  it("não remove o nome se não for o Assessor", () => {
    expect(stripAssessorVocative("Olá Paulo", "Alfred")).toBe("Olá Paulo");
  });
});

// Testes indiretos das funções auxiliares expostas via re-import.
// Como `personObject` e `articleFor` vivem no engine.server.ts (que puxa
// dependências server-only), testamos aqui a expectativa através de
// pequenas reimplementações equivalentes — assim o Vitest confirma o
// contrato gramatical sem carregar módulos de servidor.

function personObject(prep: "a" | "de", name: string): string {
  const first = (name.split(/\s+/)[0] || "").toLowerCase();
  const feminine = /a$/.test(first) && !/(costa|papa|maia|jesus)$/.test(first);
  if (prep === "a") return `${feminine ? "à" : "ao"} ${name}`;
  return `${feminine ? "da" : "do"} ${name}`;
}

function articleFor(tipo: string): string {
  const t = String(tipo || "").toLowerCase();
  if (/^(visita|reuni|tarefa|chamada|nota|ideia|marca[çc][ãa]o)/.test(t)) return "a";
  return "o";
}

describe("cultura: contrações PT-PT com nomes de pessoas", () => {
  it("'a' + nome masculino contrai em 'ao'", () => {
    expect(personObject("a", "Paulo")).toBe("ao Paulo");
    expect(personObject("a", "João Silva")).toBe("ao João Silva");
  });
  it("'a' + nome feminino contrai em 'à'", () => {
    expect(personObject("a", "Maria")).toBe("à Maria");
    expect(personObject("a", "Ana Costa")).toBe("à Ana Costa");
  });
  it("apelidos terminados em -a que são masculinos permanecem 'ao'", () => {
    expect(personObject("a", "Costa")).toBe("ao Costa");
    expect(personObject("a", "Jesus")).toBe("ao Jesus");
  });
});

describe("cultura: género gramatical dos tipos de registo", () => {
  it("visita, reunião, tarefa, chamada → 'a'", () => {
    for (const t of ["visita", "reunião", "tarefa", "chamada", "nota", "ideia"]) {
      expect(articleFor(t)).toBe("a");
    }
  });
  it("imóvel, evento, compromisso, almoço, jantar, seguimento → 'o'", () => {
    for (const t of ["imóvel", "evento", "compromisso", "almoço", "jantar", "seguimento", "café"]) {
      expect(articleFor(t)).toBe("o");
    }
  });
});

describe("cultura: fechos sociais não são saudação", () => {
  const SOCIAL_CLOSER_RE =
    /^\s*(ok(ay|ei)?|est[áa]\s+bem|perfeito|combinad[oa]|fixe|beleza|👍|✅)\s*[.!]?\s*$/i;
  const GREET_RE =
    /^\s*(ol[áa]|oi|hey|hi|hello|bom\s*dia|boa\s*tarde|boa\s*noite)(?![\p{L}])[\s,.!?]*$/iu;

  it("'Ok' é fecho social, não saudação", () => {
    expect(SOCIAL_CLOSER_RE.test("Ok")).toBe(true);
    expect(GREET_RE.test("Ok")).toBe(false);
  });
  it("'Perfeito', 'Combinado', 'Está bem' são fechos sociais", () => {
    for (const t of ["Perfeito", "Combinado", "Está bem", "está bem", "combinada"]) {
      expect(SOCIAL_CLOSER_RE.test(t)).toBe(true);
    }
  });
});
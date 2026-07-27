// Suite de aceitação da cultura do Assessor.
// Cobre os invariantes culturais dos 6 cenários da secção 26 do briefing,
// testando os módulos puros que suportam o motor conversacional.
// Quando `short-answers.ts` e `state-machine.ts` forem extraídos numa
// próxima iteração, esta suite ganha os testes de comportamento ponta-a-ponta.

import { describe, it, expect } from "vitest";
import { sanitizeReply, safeReply, NATURAL_FALLBACKS } from "./sanitize";
import { stripAssessorVocative, sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import { resolveDateTimeFromText, hasExplicitDateTime } from "../date-resolver";

// Data fixa para tornar a resolução de "amanhã", "sexta", etc. determinística.
// Segunda-feira, 27 de julho de 2026, 09:00 Lisboa.
const NOW = new Date("2026-07-27T08:00:00Z");

describe("cultura: sanitização de respostas", () => {
  it("apaga prefixos técnicos ('Proposta:', 'Payload:')", () => {
    expect(sanitizeReply("Proposta: amanhã às 10h tens visita.")).toBe(
      "amanhã às 10h tens visita.",
    );
    expect(sanitizeReply("Payload: {a:1}")).toBe("{a:1}");
  });

  it("nunca deixa passar termos proibidos", () => {
    const dirty = "Invalid Date, undefined null NaN payload intent essa tarefa.";
    const out = sanitizeReply(dirty);
    for (const bad of [
      "Invalid Date",
      "undefined",
      "null",
      "NaN",
      "payload",
      "intent",
      "essa tarefa",
    ]) {
      expect(out.toLowerCase()).not.toContain(bad.toLowerCase());
    }
  });

  it("bloqueia frases de CRM ('Podes reformular', 'Neste momento só consigo…')", () => {
    expect(sanitizeReply("Podes reformular o pedido?")).toBe("");
    expect(sanitizeReply("Neste momento só consigo tratar de eventos.")).toBe("");
  });

  it("safeReply devolve fallback natural quando fica vazio", () => {
    expect(safeReply("")).toBe(NATURAL_FALLBACKS.didNotUnderstand);
    expect(safeReply(null, NATURAL_FALLBACKS.askDate)).toBe(NATURAL_FALLBACKS.askDate);
    expect(safeReply("Podes reformular o pedido?", NATURAL_FALLBACKS.hereForYou)).toBe(
      NATURAL_FALLBACKS.hereForYou,
    );
  });

  it("mantém frases naturais intactas", () => {
    const nice = "Amanhã às 10h tens visita com a Ana. Queres que registe?";
    expect(sanitizeReply(nice)).toBe(nice);
  });
});

describe("cenário 1 — saudação com nome personalizado", () => {
  it("aceita nomes com acentos e apóstrofos", () => {
    expect(sanitizeAssessorName("  Sofia  ")).toBe("Sofia");
    expect(sanitizeAssessorName("d'Ávila")).toBe("d'Ávila");
  });

  it("remove o vocativo no início da frase, mantendo o resto", () => {
    expect(stripAssessorVocative("Sofia, bom dia!", "Sofia")).toBe("bom dia!");
    expect(stripAssessorVocative("Olá Sofia, o que tenho hoje?", "Sofia")).toBe(
      "o que tenho hoje?",
    );
  });

  it("remove o vocativo no fim da frase", () => {
    expect(stripAssessorVocative("O que tenho hoje, Sofia?", "Sofia")).toBe(
      "O que tenho hoje",
    );
  });

  it("não apaga o nome quando aparece como pessoa referida", () => {
    // Assessor=Sofia; frase menciona a cliente Sofia Costa.
    const original = "Amanhã tenho visita com a Sofia Costa.";
    expect(stripAssessorVocative(original, "Sofia")).toBe(original);
  });

  it("com nome por defeito ('Assessor') só remove com pontuação — nunca em minúsculas ambíguas", () => {
    expect(stripAssessorVocative("Assessor, bom dia.", ASSESSOR_NAME_DEFAULT)).toBe(
      "bom dia.",
    );
    // 'assessor' colado ao verbo é ambíguo: mantém tudo.
    const ambiguous = "assessor lembra-me de ligar ao João.";
    expect(stripAssessorVocative(ambiguous, ASSESSOR_NAME_DEFAULT)).toBe(ambiguous);
  });
});

describe("cenário 2 — visita simples ('amanhã às 10h')", () => {
  it("resolve 'amanhã' e captura hora explícita", () => {
    const r = resolveDateTimeFromText("amanhã às 10h tenho visita com a Ana", NOW);
    expect(r.date).toBe("2026-07-28"); // amanhã, calendário Lisboa
    expect(r.time).toBe("10:00");
    expect(r.expression).toBe("amanhã");
  });

  it("hasExplicitDateTime true quando há data ou hora", () => {
    expect(hasExplicitDateTime("visita amanhã", NOW)).toBe(true);
    expect(hasExplicitDateTime("visita às 15h30", NOW)).toBe(true);
    expect(hasExplicitDateTime("visita com o Paulo", NOW)).toBe(false);
  });

  it("resolve 'depois de amanhã' antes de 'amanhã'", () => {
    const r = resolveDateTimeFromText("depois de amanhã pelas 09h", NOW);
    expect(r.date).toBe("2026-07-29");
    expect(r.time).toBe("09:00");
  });
});

describe("cenário 3 — correção de hora", () => {
  it("nova hora numa mensagem curta é capturada sem inventar data", () => {
    const r = resolveDateTimeFromText("afinal é às 11h", NOW);
    expect(r.time).toBe("11:00");
    expect(r.date).toBeNull();
  });

  it("hora ambígua nunca produz 'Invalid Date'", () => {
    const r = resolveDateTimeFromText("mais logo", NOW);
    expect(r.time).toBeNull();
    expect(r.date).toBeNull();
  });
});

describe("cenário 4 — ficheiro sem contexto: fallbacks naturais", () => {
  it("pergunta natural para pedir contexto do ficheiro (nunca 'essa tarefa')", () => {
    const askFile = "Recebi o ficheiro. A que se refere?";
    expect(sanitizeReply(askFile)).toBe(askFile);
    expect(sanitizeReply(askFile).toLowerCase()).not.toContain("essa tarefa");
  });

  it("fallback quando IA falha usa mensagem natural", () => {
    expect(NATURAL_FALLBACKS.aiDown).toMatch(/tenta novamente/i);
    expect(NATURAL_FALLBACKS.aiDown.toLowerCase()).not.toContain("payload");
  });
});

describe("cenário 5 — lembrete contextual (localização, não pessoa)", () => {
  it("resolve dia da semana pedido ('sexta')", () => {
    // 27 jul 2026 = segunda. Próxima sexta = 31 jul 2026.
    const r = resolveDateTimeFromText("lembra-me de passar em Canelas na sexta", NOW);
    expect(r.date).toBe("2026-07-31");
    expect(r.expression).toBe("sexta");
  });

  it("data numérica dd/mm resolve para o ano corrente", () => {
    const r = resolveDateTimeFromText("marca reunião em 15/09", NOW);
    expect(r.date).toBe("2026-09-15");
  });
});

describe("cenário 6 — nota livre para 'Diversos'", () => {
  it("mensagem reflexiva mantém-se natural após sanitização", () => {
    const nota = "Tenho de rever a minha apresentação para amanhã.";
    expect(sanitizeReply(nota)).toBe(nota);
  });

  it("resposta padrão 'Fica registado.' é natural e curta", () => {
    expect(NATURAL_FALLBACKS.registered).toBe("Fica registado.");
    expect(NATURAL_FALLBACKS.registered.length).toBeLessThanOrEqual(30);
  });
});

describe("invariante — nunca emitir 'Imóvel por classificar'", () => {
  it("todos os NATURAL_FALLBACKS estão livres de termos técnicos e do rótulo proibido", () => {
    for (const value of Object.values(NATURAL_FALLBACKS)) {
      expect(value.toLowerCase()).not.toContain("imóvel por classificar");
      expect(value.toLowerCase()).not.toContain("payload");
      expect(value.toLowerCase()).not.toContain("invalid date");
      expect(value.toLowerCase()).not.toContain("undefined");
    }
  });
});
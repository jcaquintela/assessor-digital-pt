import { describe, it, expect } from "vitest";
import {
  classifyShortAnswer,
  isConfirmation,
  isRejection,
  isGreeting,
  isThanks,
  detectCorrection,
  wantsAnother,
  extractShortDate,
  extractShortTime,
} from "./short-answers";

const NOW = new Date("2026-07-27T08:00:00Z"); // seg 27/07/2026 Lisboa

describe("short-answers: confirmações e recusas", () => {
  it("aceita confirmações comuns em PT-PT", () => {
    for (const s of ["sim", "Sim!", "sim, regista", "ok", "OK.", "está bem", "pode ser", "claro", "faz isso", "regista"]) {
      expect(isConfirmation(s)).toBe(true);
    }
  });
  it("rejeita não-confirmações", () => {
    for (const s of ["sim, mas amanhã", "sim, e mais uma", "quero registar isto"]) {
      expect(isConfirmation(s)).toBe(false);
    }
  });
  it("aceita recusas", () => {
    for (const s of ["não", "Nao", "cancela", "esquece", "para", "não registes"]) {
      expect(isRejection(s)).toBe(true);
    }
  });
});

describe("short-answers: saudações e agradecimentos", () => {
  it("reconhece saudações isoladas com acentos e caixa", () => {
    for (const s of ["olá", "OLÁ", "Bom dia", "boa tarde", "boa noite!"]) {
      expect(isGreeting(s)).toBe(true);
    }
  });
  it("não trata frases longas como saudação pura", () => {
    expect(isGreeting("olá, tenho visita amanhã")).toBe(false);
  });
  it("reconhece agradecimentos", () => {
    for (const s of ["obrigado", "Obrigada!", "valeu"]) {
      expect(isThanks(s)).toBe(true);
    }
  });
});

describe("short-answers: correções e 'mais uma'", () => {
  it("deteta prefixos de correção", () => {
    for (const s of ["mas é amanhã", "afinal são 300 mil", "é às 11h", "não é Paulo, é Pedro", "corrige o valor"]) {
      expect(detectCorrection(s)).toBe(true);
    }
  });
  it("wantsAnother sem data/hora explícitas", () => {
    expect(wantsAnother("tenho mais uma visita")).toBe(true);
    expect(wantsAnother("tenho mais uma visita amanhã")).toBe(false);
  });
});

describe("short-answers: extracção de data/hora", () => {
  it("extrai datas comuns", () => {
    expect(extractShortDate("amanhã", NOW)).toBe("2026-07-28");
    expect(extractShortDate("depois de amanhã", NOW)).toBe("2026-07-29");
    expect(extractShortDate("sexta", NOW)).toBe("2026-07-31");
    expect(extractShortDate("hoje", NOW)).toBe("2026-07-27");
  });
  it("extrai horas em vários formatos", () => {
    expect(extractShortTime("às 10h", NOW)).toBe("10:00");
    expect(extractShortTime("15:30", NOW)).toBe("15:30");
    expect(extractShortTime("10 horas", NOW)).toBe("10:00");
    expect(extractShortTime("meio-dia", NOW)).toBe("12:00");
    expect(extractShortTime("meia-noite", NOW)).toBe("00:00");
  });
});

describe("short-answers: classificador agregador", () => {
  it("classifica confirmações e recusas antes de qualquer outra coisa", () => {
    expect(classifyShortAnswer("sim", NOW).kind).toBe("confirmation");
    expect(classifyShortAnswer("não", NOW).kind).toBe("rejection");
    expect(classifyShortAnswer("ok", NOW).kind).toBe("confirmation");
  });
  it("classifica saudações e agradecimentos", () => {
    expect(classifyShortAnswer("olá", NOW).kind).toBe("greeting");
    expect(classifyShortAnswer("Bom dia", NOW).kind).toBe("greeting");
  });
  it("classifica datas e horas isoladas", () => {
    expect(classifyShortAnswer("amanhã", NOW)).toMatchObject({ kind: "date_only", date: "2026-07-28" });
    expect(classifyShortAnswer("às 12h", NOW)).toMatchObject({ kind: "time_only", time: "12:00" });
    expect(classifyShortAnswer("amanhã às 12h", NOW)).toMatchObject({ kind: "datetime", date: "2026-07-28", time: "12:00" });
  });
  it("classifica correção com data nova", () => {
    const r = classifyShortAnswer("mas é amanhã", NOW);
    expect(r.kind).toBe("correction");
    expect(r.date).toBe("2026-07-28");
  });
  it("devolve unknown para texto arbitrário", () => {
    expect(classifyShortAnswer("preciso de pensar sobre isto", NOW).kind).toBe("unknown");
  });
  it("respeita limites Unicode em nomes com acentos", () => {
    // Não deve marcar como saudação — contém conteúdo depois do vocativo.
    expect(classifyShortAnswer("Olá Alfred, tenho visita amanhã", NOW).kind).not.toBe("greeting");
  });
});

describe("short-answers: regressão — 'sim' nunca é saudação", () => {
  it("'sim' é confirmação e nunca saudação nem fecho social", () => {
    expect(isConfirmation("sim")).toBe(true);
    expect(isGreeting("sim")).toBe(false);
    expect(classifyShortAnswer("sim", NOW).kind).toBe("confirmation");
  });
  it("'Sim' com maiúscula/pontuação continua confirmação", () => {
    for (const s of ["Sim", "Sim.", "Sim!", "sim!"]) {
      expect(isConfirmation(s)).toBe(true);
      expect(isGreeting(s)).toBe(false);
    }
  });
  it("'ok' é confirmação (nunca greeting)", () => {
    expect(isConfirmation("ok")).toBe(true);
    expect(isGreeting("ok")).toBe(false);
    expect(classifyShortAnswer("ok", NOW).kind).toBe("confirmation");
  });
  it("'pode ser' e 'está bem' são confirmações", () => {
    expect(classifyShortAnswer("pode ser", NOW).kind).toBe("confirmation");
    expect(classifyShortAnswer("está bem", NOW).kind).toBe("confirmation");
  });
});
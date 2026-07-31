import { describe, it, expect } from "vitest";
import { cleanTitle, ensureTitle, displayTitle, isPlaceholderTitle } from "./titles";
import { sanitizeReply } from "./culture/sanitize";
import { detectAgendaQuery } from "./v3/deterministic.server";

describe("títulos: a string 'null' nunca é um título", () => {
  it("deteta placeholders", () => {
    for (const v of ["null", "NULL", " undefined ", "sem título", "-", "", null, undefined]) {
      expect(isPlaceholderTitle(v)).toBe(true);
    }
    expect(isPlaceholderTitle("Ligar ao Paulo")).toBe(false);
  });

  it("limpa tokens colados", () => {
    expect(cleanTitle("null - ligar ao Paulo")).toBe("ligar ao Paulo");
    expect(cleanTitle("null")).toBeNull();
  });

  it("usa genérico ao gravar", () => {
    expect(ensureTitle("null", "Lembrete")).toBe("Lembrete");
    expect(ensureTitle(null, "Compromisso")).toBe("Compromisso");
    expect(ensureTitle("Visita T3")).toBe("Visita T3");
  });

  it("nunca mostra 'null' ao consultor", () => {
    expect(displayTitle("null")).toBe("compromisso");
    expect(sanitizeReply("Hoje às 15h25 tens um null. Queres que registe?"))
      .toBe("Hoje às 15h25 tens um lembrete. Queres que registe?");
  });
});

describe("intenção: Diversos não é agenda", () => {
  it("'Diversos o que tenho?' não é consulta de agenda", () => {
    expect(detectAgendaQuery("Diversos o que tenho?")).toBeNull();
    expect(detectAgendaQuery("o que tenho hoje em diversos?")).toBeNull();
    expect(detectAgendaQuery("que notas tenho?")).toBeNull();
  });
  it("agenda continua a funcionar", () => {
    expect(detectAgendaQuery("O que tenho hoje?")).toBe("today");
    expect(detectAgendaQuery("que reuniões tenho hoje?")).toBe("today");
    expect(detectAgendaQuery("E amanhã?")).toBe("tomorrow");
  });
});

import { detectMiscQuery } from "./v3/deterministic.server";

describe("fast-path de Diversos", () => {
  it("apanha perguntas sobre Diversos", () => {
    expect(detectMiscQuery("Diversos o que tenho?")).toBe(true);
    expect(detectMiscQuery("mostra-me as notas")).toBe(true);
    expect(detectMiscQuery("o que tenho em diversos hoje?")).toBe(true);
  });
  it("não apanha agenda nem registos novos", () => {
    expect(detectMiscQuery("O que tenho hoje?")).toBe(false);
    expect(detectMiscQuery("que reuniões tenho hoje?")).toBe(false);
    expect(detectMiscQuery("nota: falar com o Paulo")).toBe(false);
  });
});

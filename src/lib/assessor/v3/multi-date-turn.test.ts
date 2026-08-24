import { describe, it, expect } from "vitest";
import {
  classifyMultiDateIntent,
  allowsSameTurnSiblings,
  countDateMentions,
  breakdownHasSeparateDates,
} from "./multi-date-turn";

const IOLANDA =
  "tenho a marcação das unhas dia 13 de agosto às 15 e depois tenho no dia 7 de setembro às 10 da manhã";

describe("golden 1 — áudio da Iolanda: dois compromissos, não reagendamento", () => {
  it("reconhece duas datas e classifica como adição", () => {
    expect(countDateMentions(IOLANDA)).toBeGreaterThanOrEqual(2);
    expect(classifyMultiDateIntent(IOLANDA)).toBe("separate");
    expect(allowsSameTurnSiblings(IOLANDA)).toBe(true);
  });

  it("itens do áudio com datas distintas contam como irmãos do mesmo turno", () => {
    expect(breakdownHasSeparateDates([
      { due_date: "2026-08-13", text: "Marcação das unhas" },
      { due_date: "2026-09-07", text: "Marcação das unhas" },
    ])).toBe(true);
  });
});

describe("golden 2 — correção dentro da mesma frase: um só compromisso", () => {
  it.each([
    "marcação das unhas dia 13, ah não, afinal é dia 7 de setembro",
    "é dia 13 de agosto... espera, quer dizer dia 7 de setembro",
    "põe dia 13, desculpa, dia 7 de setembro",
  ])("não duplica: %s", (t) => {
    expect(classifyMultiDateIntent(t)).toBe("correction");
    expect(allowsSameTurnSiblings(t)).toBe(false);
  });
});

describe("golden 3 — reagendamento em turno separado mantém-se", () => {
  it("uma só data: comportamento antigo (reagenda o existente)", () => {
    expect(classifyMultiDateIntent("muda a marcação das unhas para sexta")).toBe("single");
    expect(allowsSameTurnSiblings("muda a marcação das unhas para sexta")).toBe(false);
    expect(allowsSameTurnSiblings("passa a marcação das unhas para dia 7 às 10")).toBe(false);
  });
});

describe("sem duplicação no sentido oposto", () => {
  it("duas datas sem sinal de adição nem correção fica no comportamento antigo", () => {
    expect(allowsSameTurnSiblings("marcação das unhas dia 13 dia 7")).toBe(false);
  });

  it("um só item datado no áudio não cria irmãos", () => {
    expect(breakdownHasSeparateDates([{ due_date: "2026-08-13" }, { due_date: null }])).toBe(false);
    expect(breakdownHasSeparateDates([
      { due_date: "2026-08-13" }, { due_date: "2026-08-13" },
    ])).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { isRegisterOnly, isAnswerablePending, PENDING_ANSWER_WINDOW_MS } from "./pending-answerable";

describe("isRegisterOnly", () => {
  for (const t of [
    "Só registar",
    "só registar por agora",
    "apenas guardar",
    "regista só",
    "sem lembrete",
    "não é preciso lembrete",
    "Não precisas de me lembrar",
    "não marques nada",
  ]) it(`reconhece: ${t}`, () => expect(isRegisterOnly(t)).toBe(true));

  for (const t of ["sim", "lembra hoje às 19:10", "marca visita amanhã", ""])
    it(`ignora: ${t || "(vazio)"}`, () => expect(isRegisterOnly(t)).toBe(false));
});

describe("isAnswerablePending", () => {
  const now = new Date("2026-08-03T18:00:00Z");
  it("pendente recente é respondível", () => {
    expect(isAnswerablePending({ updated_at: "2026-08-03T17:59:00Z" }, { now })).toBe(true);
  });
  it("pendente antigo já não é respondível", () => {
    expect(isAnswerablePending({ updated_at: "2026-08-03T17:50:00Z" }, { now })).toBe(false);
  });
  it("pendente antigo continua respondível se a pergunta ainda é a última do assessor", () => {
    expect(
      isAnswerablePending(
        { updated_at: "2026-08-03T17:50:00Z", current_question: "Para quando é?" },
        { now, lastAssistantContent: "Para quando é?" },
      ),
    ).toBe(true);
  });
  it("pergunta nova sobre outro assunto não revive o pendente antigo", () => {
    expect(
      isAnswerablePending(
        { updated_at: "2026-08-03T17:50:00Z", current_question: "Queres que te lembre da visita?" },
        { now, lastAssistantContent: "Para quando é a placa de Canelas?" },
      ),
    ).toBe(false);
  });
  it("janela é de 3 minutos", () => expect(PENDING_ANSWER_WINDOW_MS).toBe(180000));
});

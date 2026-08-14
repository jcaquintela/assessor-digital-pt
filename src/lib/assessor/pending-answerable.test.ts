import { describe, it, expect } from "vitest";
import {
  isRegisterOnly,
  isAnswerablePending,
  pendingIsLastQuestion,
  PENDING_ANSWER_WINDOW_MS,
} from "./pending-answerable";

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

describe("golden: 'ok' solto não confirma pendente esquecido", () => {
  const apagar = {
    status: "pending_confirmation",
    intent: "confirm_bulk_archive",
    current_question: "Queres mesmo apagar estes 9 áudios?",
    updated_at: "2026-08-12T10:00:00Z",
  };
  const now = new Date("2026-08-14T20:30:00Z");

  it("conversa mudou de assunto: 'ok' não responde ao pendente antigo", () => {
    expect(
      isAnswerablePending(apagar, {
        now,
        lastAssistantContent: "Vou buscar as últimas novidades para te mostrar o que há de novo.",
      }),
    ).toBe(false);
  });

  it("citação directa da pergunta antiga continua a valer", () => {
    expect(
      isAnswerablePending(apagar, {
        now,
        lastAssistantContent: "Vou buscar as últimas novidades.",
        quotedText: "Queres mesmo apagar estes 9 áudios?",
      }),
    ).toBe(true);
  });

  it("pergunta ainda no ecrã mantém a janela alargada de 24h", () => {
    expect(
      isAnswerablePending(
        { ...apagar, updated_at: "2026-08-14T09:00:00Z" },
        { now, lastAssistantContent: "Queres mesmo apagar estes 9 áudios?" },
      ),
    ).toBe(true);
  });

  it("pendingIsLastQuestion distingue os dois casos", () => {
    expect(pendingIsLastQuestion(apagar, "Queres mesmo apagar estes 9 áudios?")).toBe(true);
    expect(pendingIsLastQuestion(apagar, "Vou buscar as novidades.")).toBe(false);
  });
});

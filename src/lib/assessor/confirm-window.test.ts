import { describe, it, expect } from "vitest";
import {
  isAnswerablePending,
  quotedMatchesPending,
  CONFIRM_ANSWER_WINDOW_MS,
} from "./pending-answerable";
import { expiredConfirmationReply, isDestructiveConfirmation } from "./expired-confirmation";

const Q = "Encontrei 6 áudios. Queres que avance com o apagamento?";
const now = new Date("2026-08-13T20:56:00Z");
const asked = "2026-08-13T19:59:00Z";

describe("confirmação pendente ao longo do tempo", () => {
  it("1. 'sim' em reply directo 1h depois continua a resolver a pergunta", () => {
    expect(
      isAnswerablePending(
        { updated_at: asked, current_question: Q, status: "pending_confirmation" },
        { now, quotedText: Q, lastAssistantContent: "Bom dia! Tens 2 visitas hoje." },
      ),
    ).toBe(true);
  });

  it("1b. mesmo sem citação, uma confirmação aberta dura o dia", () => {
    expect(
      isAnswerablePending(
        { updated_at: asked, current_question: Q, status: "pending_confirmation" },
        { now },
      ),
    ).toBe(true);
    expect(CONFIRM_ANSWER_WINDOW_MS).toBe(86400000);
  });

  it("2. passadas 48h o pendente já não é respondível e o aviso é explícito", () => {
    expect(
      isAnswerablePending(
        { updated_at: "2026-08-11T19:59:00Z", current_question: Q, status: "pending_confirmation" },
        { now },
      ),
    ).toBe(false);
    const reply = expiredConfirmationReply(Q, { destructive: true });
    expect(reply).toContain("caducou");
    expect(reply).toContain("não avancei");
    expect(reply).toContain(Q);
  });

  it("3. citação de outra pergunta não resolve este pendente", () => {
    const outra = "Queres que te lembre de ligar ao Paulo?";
    expect(quotedMatchesPending({ current_question: Q }, outra)).toBe(false);
    expect(quotedMatchesPending({ current_question: Q }, Q)).toBe(true);
  });

  it("outra pergunta em aberto trava a janela alargada", () => {
    expect(
      isAnswerablePending(
        { updated_at: asked, current_question: Q, status: "pending_confirmation" },
        { now, lastAssistantContent: "Queres que te lembre de ligar ao Paulo?" },
      ),
    ).toBe(false);
  });

  it("apagar é destrutivo; arquivar não", () => {
    expect(isDestructiveConfirmation("confirm_bulk_archive", { mode: "delete" })).toBe(true);
    expect(isDestructiveConfirmation("confirm_bulk_archive", { mode: "archive" })).toBe(false);
  });
});

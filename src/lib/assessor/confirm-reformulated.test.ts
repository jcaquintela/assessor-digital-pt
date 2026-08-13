// Golden: pergunta → "E documentos?" → pergunta reformulada → 30 min → "Sim".
//
// Caso real (13/08, 21:45→22:13): a reformulação passou a contar como
// "pergunta nova", a janela caiu para 3 minutos e o "Sim" apanhou
// "já caducou". Agora o rascunho é re-sincronizado com a última formulação.

import { describe, it, expect } from "vitest";
import {
  isAnswerablePending,
  shouldRefreshPendingQuestion,
  CONFIRM_ANSWER_WINDOW_MS,
} from "./pending-answerable";

const Q1 = "Encontrei 9 áudios no Drive Inteligente: 1. Mensagem de voz… Queres que avance?";
const Q2 =
  "Os teus documentos não são afetados — a eliminação é exclusivamente para os 9 áudios. Queres que avance com o apagamento?";

describe("confirmação reformulada mantém a janela de 24h", () => {
  it("a reformulação sobre o mesmo assunto actualiza a pergunta em aberto", () => {
    const pending = {
      status: "pending_confirmation",
      current_question: Q1,
      updated_at: "2026-08-13T20:45:56Z",
    };
    expect(shouldRefreshPendingQuestion(pending, Q2)).toBe(true);
    expect(shouldRefreshPendingQuestion(pending, Q1)).toBe(false);
    expect(shouldRefreshPendingQuestion(pending, "Certo, fica assim.")).toBe(false);
  });

  it("'Sim' 30 minutos depois da reformulação é reconhecido", () => {
    // estado após a sincronização feita pelo motor
    const pending = {
      status: "pending_confirmation",
      current_question: Q2,
      updated_at: "2026-08-13T20:50:16Z",
    };
    expect(
      isAnswerablePending(pending, {
        now: new Date("2026-08-13T21:20:16Z"),
        lastAssistantContent: Q2,
      }),
    ).toBe(true);
    expect(CONFIRM_ANSWER_WINDOW_MS).toBe(86400000);
  });

  it("sem a sincronização era isto que falhava (regressão)", () => {
    const stale = {
      status: "pending_confirmation",
      current_question: Q1,
      updated_at: "2026-08-13T20:45:56Z",
    };
    expect(
      isAnswerablePending(stale, {
        now: new Date("2026-08-13T21:13:46Z"),
        lastAssistantContent: Q2,
      }),
    ).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  detectCompletionInstructions,
  remainingRequest,
  remainderNeedsWork,
  formatCompletionReply,
  recurrenceQuestion,
  COMPLETED_STATUS,
  COMPLETED_OUTCOME,
} from "./completion-intent";

const IOLANDA =
  "O estudo de mercado está tratado, faz uma semana. A visita de hoje ao apartamento de Consortes às 18h foi cancelada. Atualiza por favor.";

describe("detecção de conclusão", () => {
  it.each([
    "o estudo de mercado está tratado",
    "já fiz a avaliação do T2",
    "a chamada ao Nuno Castilho já está feita",
    "o contrato do Vasco já está resolvido",
  ])("reconhece: %s", (t) => expect(detectCompletionInstructions(t).length).toBe(1));

  it.each([
    "a visita das 18h foi cancelada",
    "desmarca a visita ao T2 Consortes",
    "está tratado",
    "isso já está feito?",
  ])("não confunde: %s", (t) => expect(detectCompletionInstructions(t)).toEqual([]));

  it("golden 1 — mensagem composta: só a parte de conclusão é apanhada aqui", () => {
    const found = detectCompletionInstructions(IOLANDA);
    expect(found.length).toBe(1);
    expect(found[0]!.subjectHint).toContain("estudo");
    expect(found[0]!.subjectHint).toContain("mercado");
    // A parte ambígua (visita) segue o caminho normal de desambiguação.
    expect(found[0]!.part).not.toMatch(/visita/i);
  });

  it("a sobra mantém a instrução ambígua para o motor a processar", () => {
    const found = detectCompletionInstructions(IOLANDA);
    const rest = remainingRequest(IOLANDA, found);
    expect(rest).toContain("visita");
    expect(rest).not.toContain("estudo de mercado");
    expect(remainderNeedsWork(rest)).toBe(true);
  });

  it("cola sem trabalho ('Atualiza por favor.') não relança o motor", () => {
    const msg = "O estudo de mercado está tratado. Atualiza por favor.";
    const rest = remainingRequest(msg, detectCompletionInstructions(msg));
    expect(remainderNeedsWork(rest)).toBe(false);
  });
});

describe("confirmação de conclusão", () => {
  it("diz explicitamente o que ficou concluído", () => {
    const r = formatCompletionReply([{ id: "1", title: "Estudo de mercado do T2 de Consortes" }]);
    expect(r).toBe("Marquei Estudo de mercado do T2 de Consortes como concluído.");
  });

  it("vários itens saem numerados", () => {
    const r = formatCompletionReply([{ title: "Estudo de mercado" }, { title: "Ligar ao Nuno" }]);
    expect(r).toContain("1) Estudo de mercado");
    expect(r).toContain("2) Ligar ao Nuno");
  });

  it("sem nada por fechar não finge que fechou", () => {
    const r = formatCompletionReply([], "estudo de mercado");
    expect(r).toContain("não encontrei nada por fechar");
    expect(r).not.toMatch(/marquei/i);
  });

  it("golden 2 — recorrência não é desligada sozinha: pergunta ao consultor", () => {
    expect(recurrenceQuestion("Estudo de mercado semanal")).toBe(
      "Isto repete-se automaticamente (Estudo de mercado semanal) — queres que continue a repetir?",
    );
  });

  it("estado gravado é o canónico fechado em todas as superfícies", async () => {
    const { followUpStateLabel } = await import("@/lib/follow-ups/state");
    expect(COMPLETED_STATUS).toBe("Concluído");
    expect(COMPLETED_OUTCOME).toBe("concluido");
    expect(
      followUpStateLabel({ status: COMPLETED_STATUS, outcome: COMPLETED_OUTCOME, archived_at: null }),
    ).toBe("Concluído");
  });
});

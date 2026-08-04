import { describe, it, expect } from "vitest";
import { computeQualitySignals } from "./quality.server";
import type { Decision } from "./types";

const baseDecision = (over: Partial<Decision> = {}): Decision => ({
  confidence: 0.9, action: "acknowledge", tool_calls: [], memory_writes: [], natural_reply: "Perfeito.", ...over,
});

describe("AQS — sinais", () => {
  it("acknowledge natural = tudo positivo", () => {
    const s = computeQualitySignals({ decision: baseDecision(), toolResults: [], reply: "Perfeito." });
    expect(s.understood_first_try).toBe(true);
    expect(s.executed_successfully).toBe(true);
    expect(s.human_tone).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(0.75);
  });

  it("ask baixa understood_first_try", () => {
    const s = computeQualitySignals({ decision: baseDecision({ action: "ask", natural_reply: "A que horas?" }), toolResults: [], reply: "A que horas?" });
    expect(s.understood_first_try).toBe(false);
  });

  it("act com falha marca executed_successfully=false", () => {
    const s = computeQualitySignals({
      decision: baseDecision({ action: "act", tool_calls: [{ name: "x", arguments: {} }] }),
      toolResults: [{ name: "x", ok: false, error: "e", latencyMs: 1 }],
      reply: "Não consegui.",
    });
    expect(s.executed_successfully).toBe(false);
  });

  it("vocabulário técnico corta human_tone", () => {
    const s = computeQualitySignals({ decision: baseDecision(), toolResults: [], reply: "Payload registado no backend." });
    expect(s.human_tone).toBe(false);
  });

  it("resposta normal a uma pergunta do Afonso NÃO conta como reformulação", () => {
    const s = computeQualitySignals({
      decision: baseDecision(), toolResults: [], reply: "Marcado.",
      previousUserTurnAt: new Date(Date.now() - 10_000),
      message: "Às 15h",
      previousUserMessage: "Marca visita com a Iolanda amanhã",
      lastAssistantReply: "A que horas queres a visita?",
    });
    expect(s.reformulated).toBe(false);
  });

  it("continuação com outro assunto NÃO conta", () => {
    const s = computeQualitySignals({
      decision: baseDecision(), toolResults: [], reply: "Registado.",
      previousUserTurnAt: new Date(Date.now() - 20_000),
      message: "Recebi a caderneta predial do T3 da Boavista",
      previousUserMessage: "Liga-me à tarde ao Sr. Costa",
      lastAssistantReply: "Combinado.",
    });
    expect(s.reformulated).toBe(false);
  });

  it("repetição genuína do mesmo pedido conta", () => {
    const s = computeQualitySignals({
      decision: baseDecision(), toolResults: [], reply: "Não percebi.",
      previousUserTurnAt: new Date(Date.now() - 30_000),
      message: "Placa Santa Maria da Feira T2 varanda 165000",
      previousUserMessage: "Placa Santa Maria da Feira T2 varanda 165000",
      lastAssistantReply: "Não percebi bem essa parte.",
    });
    expect(s.reformulated).toBe(true);
  });

  it("correção explícita logo a seguir conta", () => {
    const s = computeQualitySignals({
      decision: baseDecision(), toolResults: [], reply: "Corrigido.",
      previousUserTurnAt: new Date(Date.now() - 15_000),
      message: "Afinal não era a Iolanda, era a Iolanda Sousa",
      previousUserMessage: "Marca visita com a Iolanda amanhã às 10h",
      lastAssistantReply: "Marquei a visita.",
    });
    expect(s.reformulated).toBe(true);
  });
});
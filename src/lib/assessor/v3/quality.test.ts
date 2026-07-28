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

  it("reformulação detectada quando anterior é < 60s", () => {
    const s = computeQualitySignals({
      decision: baseDecision(), toolResults: [], reply: "Ok.",
      previousUserTurnAt: new Date(Date.now() - 10_000),
    });
    expect(s.reformulated).toBe(true);
  });
});
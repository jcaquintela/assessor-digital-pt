import { describe, it, expect } from "vitest";
import { computeATS, computeContextPreservation, computeSafeDecisions, computeTaskSuccess } from "./trust.server";
import type { Decision } from "./types";

const dec = (over: Partial<Decision> = {}): Decision => ({
  confidence: 0.9, action: "acknowledge", tool_calls: [], memory_writes: [], natural_reply: "Perfeito.", ...over,
});

describe("Trust — pilares", () => {
  it("task_success = null quando não é act", () => {
    expect(computeTaskSuccess(dec(), [])).toBeNull();
  });
  it("task_success = 1 quando act com todas as tools ok", () => {
    expect(computeTaskSuccess(
      dec({ action: "act", tool_calls: [{ name: "x", arguments: {} }] }),
      [{ name: "x", ok: true, latencyMs: 1 }],
    )).toBe(1);
  });
  it("task_success = 0 quando act com tool falhada", () => {
    expect(computeTaskSuccess(
      dec({ action: "act", tool_calls: [{ name: "x", arguments: {} }] }),
      [{ name: "x", ok: false, error: "e", latencyMs: 1 }],
    )).toBe(0);
  });

  it("safe_decisions penaliza preclaim sem tools ok", () => {
    const s = computeSafeDecisions({
      decision: dec({ action: "act", natural_reply: "Feito, marquei a visita." }),
      toolResults: [{ name: "x", ok: false, error: "e", latencyMs: 1 }],
      finalReply: "Marquei a visita.",
    });
    expect(s).toBeLessThan(0.5);
  });

  it("context_preservation penaliza duplicate", () => {
    const s = computeContextPreservation({
      decision: dec({ action: "act" }),
      toolResults: [{ name: "x", ok: false, error: "duplicate_key", latencyMs: 1 }],
      conversationState: null, historyPreview: "", currentMessage: "cria seguimento",
    });
    expect(s).toBeLessThan(1);
  });

  it("ATS combina pesos correctamente (só AQS presente)", () => {
    const ats = computeATS({
      task_success: null, aqs_score: 0.8, corrections_count: 0,
      context_preservation: null, safe_decisions: null,
    });
    expect(ats).toBe(80);
  });

  it("ATS aplica correções (>=3 = zero nesse pilar)", () => {
    const ats = computeATS({
      task_success: 1, aqs_score: 1, corrections_count: 3,
      context_preservation: 1, safe_decisions: 1,
    });
    expect(ats).toBe(85);
  });
});
import { describe, expect, it } from "vitest";
import { logAiTurn, recordEngineTurn } from "./telemetry-repo.server";

function fakeSupabase() {
  const writes: { table: string; row: any }[] = [];
  return {
    writes,
    from(table: string) {
      return {
        insert(row: any) {
          writes.push({ table, row });
          return {
            select: () => ({ maybeSingle: async () => ({ data: { id: "trace-1" } }) }),
            then: (r: any) => Promise.resolve({ error: null }).then(r),
          };
        },
      };
    },
  } as any;
}

describe("TelemetryRepo", () => {
  it("escreve em assessor_ai_logs com a mesma forma que o motor escrevia inline", async () => {
    const db = fakeSupabase();
    await logAiTurn(db, {
      userId: "u1", channel: "telegram", intent: "agenda_query_fast_path",
      route: "v3-deterministic", latencyMs: 42, success: true, error: null,
      toolName: "search_agenda", toolSuccess: true, fallbackUsed: false,
    });
    expect(db.writes[0]).toEqual({
      table: "assessor_ai_logs",
      row: {
        user_id: "u1", channel: "telegram", model: "reasoning-engine-v3",
        intent: "agenda_query_fast_path", confidence: 1,
        input_tokens: 0, output_tokens: 0, total_tokens: 0,
        latency_ms: 42, success: true, error: null,
        domain: "assessor", route: "v3-deterministic", fallback_used: false,
        tool_name: "search_agenda", tool_success: true,
      },
    });
  });

  it("respeita domínio e tokens explícitos", async () => {
    const db = fakeSupabase();
    await logAiTurn(db, {
      userId: "u1", channel: "whatsapp", intent: "sparring_turn", route: "v3-sparring",
      inputTokens: 10, outputTokens: 5, latencyMs: 7, success: false,
      error: "boom", fallbackUsed: true, domain: "financial",
    });
    expect(db.writes[0]?.row).toMatchObject({
      domain: "financial", input_tokens: 10, output_tokens: 5, total_tokens: 15,
      fallback_used: true, error: "boom", tool_name: null, tool_success: null,
    });
  });

  it("regista trace + log do turno completo e devolve o trace id", async () => {
    const db = fakeSupabase();
    const traceId = await recordEngineTurn(db, {
      userId: "u1", channel: "telegram", sourceMessageId: "m1",
      inputContent: "olá", observations: [], hypotheses: [], searches: [],
      decision: { confidence: 0.8 }, toolCalls: [
        { name: "create_reminder", ok: true },
        { name: "update_person", ok: false, error: "not_found" },
      ],
      memoryWrites: [], reply: "feito", thinkLatencyMs: 1, decideLatencyMs: 2,
      totalLatencyMs: 3, inputTokens: 100, outputTokens: 20, success: false,
      error: null, confidence: 0.8,
    });
    expect(traceId).toBe("trace-1");
    expect(db.writes.map((w) => w.table)).toEqual([
      "assessor_reasoning_traces", "assessor_ai_logs",
    ]);
    expect(db.writes[1]?.row).toMatchObject({
      intent: "reasoning_engine_v3", billed_model: "google/gemini-3.6-flash",
      modality: "texto", confidence: 0.8, total_tokens: 120,
      tool_name: "update_person", tool_success: false,
      error: "update_person:not_found", route: "v3", fallback_used: true,
    });
  });

  it("nunca lança se a escrita falhar", async () => {
    const broken = { from: () => { throw new Error("db down"); } } as any;
    await expect(logAiTurn(broken, {
      userId: "u", channel: "c", intent: "i", route: "v3",
      latencyMs: 0, success: true,
    })).resolves.toBeUndefined();
  });
});

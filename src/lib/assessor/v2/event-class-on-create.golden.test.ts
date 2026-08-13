// GOLDEN — "Reunião de equipa" agendada por conversa nasce já 'interno'.
//
// Bug: a heurística negócio/interno só corria na leitura. Um compromisso
// interno criado pelo Afonso nascia sem classificação e arriscava pedir
// "Como correu?" e aparecer nas superfícies de atenção.
import { describe, it, expect, vi } from "vitest";
import { dispatchToolCall } from "./domain.server";
import { initialEventClass } from "../event-class";

vi.mock("@/lib/calendar/sync.server", () => ({ pushEventToProviders: async () => {} }));

function sbCapture(captured: { insert?: any }) {
  const build = (table: string) => {
    const state: any = { op: null, payload: null };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      ilike: () => chain,
      or: () => chain,
      in: () => chain,
      gte: () => chain,
      lt: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (state.op === "insert" && table === "follow_ups" && !captured.insert) {
          captured.insert = state.payload;
        }
        return { data: { id: "f1", title: state.payload?.title, due_date: state.payload?.due_date, due_time: state.payload?.due_time }, error: null };
      },
      insert: (row: any) => { state.op = "insert"; state.payload = row; return chain; },
      update: () => chain,
      upsert: () => chain,
    };
    chain.then = (resolve: any) => resolve({ data: [], error: null });
    return chain;
  };
  return { from: (t: string) => build(t) } as any;
}

describe("classificação no momento da criação", () => {
  it("'Reunião de equipa' sem pessoa/imóvel nasce classificada como interno", async () => {
    const captured: { insert?: any } = {};
    const r = await dispatchToolCall(
      { supabase: sbCapture(captured), userId: "u1", channel: "whatsapp" },
      "create_event",
      JSON.stringify({ title: "Reunião de equipa", event_type: "reuniao", date: "2026-08-20", start_time: "10:00" }),
    );
    expect(r.ok).toBe(true);
    expect(captured.insert?.event_class).toBe("interno");
  });

  it("visita ligada a um lead/pessoa continua sem congelar a classificação", () => {
    expect(initialEventClass({ title: "Visita com Manuel", person_id: "p1" })).toBeNull();
    expect(initialEventClass({ title: "Reunião de equipa", person_id: "p1" })).toBe("interno");
    expect(initialEventClass({ title: "Visita ao T3" })).toBe("interno");
  });
});

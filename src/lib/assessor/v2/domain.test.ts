import { describe, it, expect, vi } from "vitest";
import { dispatchToolCall } from "./domain.server";

// Stub minimalista do supabase-js chainable builder.
function fakeSb(handlers: Record<string, (op: string, payload?: any) => any>) {
  const build = (table: string) => {
    const state: any = { table, filters: [], op: null, payload: null };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      ilike: () => chain,
      or: () => chain,
      in: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => (handlers[table] ? handlers[table]("select") : { data: null, error: null }),
      single: async () => (handlers[table] ? handlers[table](state.op ?? "select", state.payload) : { data: null, error: null }),
      insert: (row: any) => { state.op = "insert"; state.payload = row; return chain; },
      update: (row: any) => { state.op = "update"; state.payload = row; return chain; },
    };
    // permitir await direto (select-list)
    (chain as any).then = (resolve: any) =>
      resolve(handlers[table] ? handlers[table]("select_list") : { data: [], error: null });
    return chain;
  };
  return { from: (t: string) => build(t) } as any;
}

describe("dispatchToolCall — contratos das ferramentas", () => {
  it("rejeita ferramentas desconhecidas", async () => {
    const r = await dispatchToolCall({ supabase: fakeSb({}), userId: "u1", channel: "web" }, "no_such", "{}");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("unknown_tool");
  });

  it("rejeita JSON inválido", async () => {
    const r = await dispatchToolCall({ supabase: fakeSb({}), userId: "u1", channel: "web" }, "search_people", "{bad json");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_json_args");
  });

  it("valida argumentos obrigatórios (search_people sem query)", async () => {
    const r = await dispatchToolCall({ supabase: fakeSb({}), userId: "u1", channel: "web" }, "search_people", "{}");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/query/);
  });

  it("create_event exige data e hora bem formadas", async () => {
    const r = await dispatchToolCall(
      { supabase: fakeSb({}), userId: "u1", channel: "web" },
      "create_event",
      JSON.stringify({ title: "Visita", event_type: "visita", date: "amanhã", start_time: "15h" }),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/date|start_time/);
  });

  it("search_people com query válida invoca supabase", async () => {
    const spy = vi.fn((op: string) => ({ data: [{ id: "p1", name: "Paulo" }], error: null }));
    const r = await dispatchToolCall(
      { supabase: fakeSb({ people: spy }), userId: "u1", channel: "web" },
      "search_people",
      JSON.stringify({ query: "Paulo" }),
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).results).toHaveLength(1);
  });
});

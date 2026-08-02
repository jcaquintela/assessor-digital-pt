import { describe, expect, it } from "vitest";
import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";

function fakeSupabase(inserts: Record<string, any[]>) {
  const api = (table: string) => ({
    select: () => api(table),
    eq: () => api(table),
    gte: () => api(table),
    lte: () => api(table),
    in: () => api(table),
    order: () => api(table),
    limit: () => api(table),
    maybeSingle: async () => ({ data: null }),
    single: async () => ({ data: { id: "new-mov" }, error: null }),
    insert: (row: any) => {
      (inserts[table] ??= []).push(row);
      return {
        select: () => ({ single: async () => ({ data: { id: `${table}-1`, ...row }, error: null }) }),
      };
    },
  });
  return { from: (t: string) => api(t) } as any;
}

describe("comissão por conversa", () => {
  it("não cria negócio sozinho", async () => {
    const inserts: Record<string, any[]> = {};
    const res = await dispatchToolCall(
      { supabase: fakeSupabase(inserts), userId: "u1", channel: "whatsapp" } as any,
      "create_financial_movement",
      JSON.stringify({ type: "commission", amount: 5000, description: "Comissão do terreno", deal_value: 200000, property_reference: "terreno" }),
    );
    expect(res.ok).toBe(true);
    expect(inserts["opportunities"] ?? []).toHaveLength(0);
    expect(inserts["financial_movements"]).toHaveLength(1);
    expect(inserts["financial_movements"][0].opportunity_id).toBeNull();
  });
});

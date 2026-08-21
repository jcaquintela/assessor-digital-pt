// Golden: o resumo de /hoje não conta registos arquivados — tem de bater
// certo com as páginas de Pessoas, Imóveis e Negócios.
import { describe, it, expect } from "vitest";
import { computeOverview } from "./overview.server";

/** Fake que HONRA `.is("archived_at", null)` — é isso que está em teste. */
function fakeSupabase(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = (tables[table] ?? []).map((r) => ({ ...r }));
      let head = false;
      const b: any = {
        select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return b; },
        eq: (c: string, v: any) => { rows = rows.filter((r) => r[c] === v); return b; },
        is: (c: string, v: any) => { rows = rows.filter((r) => (r[c] ?? null) === v); return b; },
        in: () => b, not: () => b, gte: () => b, lte: () => b, lt: () => b,
        order: () => b, limit: () => b,
        then: (res: any) => res(head ? { count: rows.length, data: null } : { data: rows }),
      };
      return b;
    },
  };
}

describe("resumo de /hoje — arquivados", () => {
  it("pessoa arquivada não entra na contagem", async () => {
    const s = fakeSupabase({
      people: [
        { id: "p1", user_id: "u1", archived_at: null },
        { id: "p2", user_id: "u1", archived_at: null },
        { id: "p3", user_id: "u1", archived_at: new Date().toISOString() },
      ],
      properties: [
        { id: "i1", user_id: "u1", status: "por_angariar", archived_at: null },
        { id: "i2", user_id: "u1", status: "por_angariar", archived_at: new Date().toISOString() },
      ],
      opportunities: [
        { id: "n1", user_id: "u1", status: "aberta", stage: "visitas", value: 1000, archived_at: null },
        { id: "n2", user_id: "u1", status: "aberta", stage: "visitas", value: 5000, archived_at: new Date().toISOString() },
      ],
      follow_ups: [], miscellaneous_items: [], financial_movements: [], interactions: [],
    });

    const r = await computeOverview(s as any, "u1");
    expect(r.people.count).toBe(2);
    expect(r.properties.count).toBe(1);
    expect(r.deals.count).toBe(1);
    expect(r.deals.value).toBe(1000);
  });
});

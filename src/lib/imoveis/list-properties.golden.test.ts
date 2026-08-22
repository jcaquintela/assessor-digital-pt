// Golden: a lista de Imóveis e a contagem de /hoje usam a mesma fonte de
// verdade (`properties.archived_at`) e batem certo com um imóvel arquivado.
import { describe, it, expect } from "vitest";
import { fetchPropertiesList } from "./list-properties.server";
import { computeOverview } from "@/lib/assessor/supreme/overview.server";

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

const PROPS = [
  { id: "i1", user_id: "u1", status: "por_angariar", archived_at: null, updated_at: "2026-01-01" },
  { id: "i2", user_id: "u1", status: "angariado", archived_at: null, updated_at: "2026-01-02" },
  { id: "i3", user_id: "u1", status: "arquivado", archived_at: "2026-02-01T10:00:00Z", updated_at: "2026-02-01" },
];

describe("imóveis — arquivado tem uma só fonte de verdade", () => {
  it("lista de Imóveis exclui o arquivado", async () => {
    const rows = await fetchPropertiesList(fakeSupabase({ properties: PROPS, uploaded_files: [] }), "u1");
    expect(rows.map((r) => r.id)).toEqual(["i1", "i2"]);
  });

  it("contagem de /hoje bate certo com a lista", async () => {
    const rows = await fetchPropertiesList(fakeSupabase({ properties: PROPS, uploaded_files: [] }), "u1");
    const overview = await computeOverview(
      fakeSupabase({
        properties: PROPS,
        people: [], opportunities: [], follow_ups: [],
        miscellaneous_items: [], financial_movements: [], interactions: [],
      }) as any,
      "u1",
    );
    expect(overview.properties.count).toBe(rows.length);
  });
});

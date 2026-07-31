import { describe, it, expect } from "vitest";
import { buildPersonBrief } from "./person-brief.server";
import { formatPersonBrief } from "./person-brief";

// Stub mínimo do cliente: devolve a fixture correspondente à tabela pedida
// e regista os filtros usados, para garantir isolamento por user_id.
function stub(fixtures: Record<string, any[]>, seen: string[][]) {
  const chain = (table: string) => {
    const q: any = {
      _t: table,
      select: () => q, eq: (c: string, v: string) => { seen.push([table, c, v]); return q; },
      ilike: () => q, in: () => q, order: () => q,
      limit: () => Promise.resolve({ data: fixtures[table] ?? [], error: null }),
      then: (r: any) => Promise.resolve({ data: fixtures[table] ?? [], error: null }).then(r),
    };
    return q;
  };
  return { from: (t: string) => chain(t) } as any;
}

describe("buildPersonBrief", () => {
  const ctx = { supabase: null as any, userId: "u1", channel: "whatsapp" };

  it("junta nota, imóvel, negócio e próxima ação numa só leitura", async () => {
    const seen: string[][] = [];
    const supabase = stub({
      people: [{ id: "p1", name: "Marta Santana", phone: "934111222", relationship_type: "proprietario", summary: null, next_action: null, next_action_date: null }],
      interactions: [{ summary: "Quer vender até setembro.", occurred_at: "2026-07-28T10:00:00Z" }],
      properties: [{ title: "T3 na Feira", status: "angariado", asking_price: 245000 }],
      opportunities: [{ type: "Venda", status: "em negociação", value: 245000, next_action: null, next_action_date: null }],
      follow_ups: [{ title: "Enviar CPCV", due_date: "2026-08-03T09:00:00Z", status: "pending" }],
    }, seen);
    const r = await buildPersonBrief({ ...ctx, supabase }, "Marta");
    expect(r.kind).toBe("ok");
    const out = formatPersonBrief((r as any).brief);
    expect(out).toContain("Última nota (28/07/2026)");
    expect(out).toContain("T3 na Feira");
    expect(out).toContain("Negócio: Venda");
    expect(out).toContain("Enviar CPCV");
    // Todas as leituras filtram por user_id.
    expect(seen.filter(([, c]) => c === "user_id").length).toBe(5);
  });

  it("pessoa inexistente devolve not_found", async () => {
    const r = await buildPersonBrief({ ...ctx, supabase: stub({ people: [] }, []) }, "Zé");
    expect(r.kind).toBe("not_found");
  });

  it("nomes distintos pedem desambiguação", async () => {
    const supabase = stub({ people: [{ id: "a", name: "Marta Santana" }, { id: "b", name: "Marta Lopes" }] }, []);
    const r = await buildPersonBrief({ ...ctx, supabase }, "Marta");
    expect(r.kind).toBe("ambiguous");
  });
});

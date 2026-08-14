// GOLDEN — resolução obrigatória de pessoa em create_follow_up ("Manuel").
//
// Caso real (14/08): "Marca visita com o Manuel amanhã" gravou o seguimento
// sem pessoa ligada e a pesquisa por "Manuel" devolvia "Manuela".
import { describe, it, expect, vi } from "vitest";
import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";

vi.mock("@/lib/calendar/sync.server", () => ({ pushEventToProviders: async () => {} }));

function fakeSb(opts: {
  people?: any[];
  phones?: any[];
  captured?: { insert?: any };
  onSelect?: (table: string, filters: Record<string, any>) => void;
}) {
  const build = (table: string) => {
    const state: any = { op: null, payload: null, filters: {} };
    const rowsFor = () => {
      if (table === "people") return opts.people ?? [];
      if (table === "person_phones") return opts.phones ?? [];
      return [];
    };
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => { state.filters[col] = val; opts.onSelect?.(table, state.filters); return chain; },
      ilike: () => chain, or: () => chain, in: () => chain, is: () => chain,
      gte: () => chain, lt: () => chain, lte: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (state.op === "insert" && table === "follow_ups" && opts.captured && !opts.captured.insert) {
          opts.captured.insert = state.payload;
        }
        return { data: { id: "f1", ...state.payload }, error: null };
      },
      insert: (row: any) => { state.op = "insert"; state.payload = row; return chain; },
      update: () => chain, upsert: () => chain,
    };
    chain.then = (resolve: any) => resolve({ data: state.op ? [] : rowsFor(), error: null });
    return chain;
  };
  return { from: (t: string) => build(t) } as any;
}

const ctx = (sb: any, extra: any = {}) => ({ supabase: sb, userId: "u1", channel: "whatsapp", ...extra }) as any;
const call = (sb: any, args: any, extra: any = {}) =>
  dispatchToolCall(ctx(sb, extra), "create_follow_up", JSON.stringify({
    title: "Visita com o Manuel", type: "tarefa", due_date: "2026-08-15", due_time: "10:00", ...args,
  }));

describe("resolução obrigatória de pessoa em create_follow_up", () => {
  it("golden 1 — nome exacto único pede confirmação leve e não escreve", async () => {
    const captured: any = {};
    const r: any = await call(fakeSb({ people: [{ id: "p1", name: "Manuel" }], captured }), {});
    expect(r.ok).toBe(true);
    expect(r.data.needsPersonConfirmation).toBe(true);
    expect(r.data.mode).toBe("confirm_exact");
    expect(captured.insert).toBeUndefined();
  });

  it("golden 2 — resolve mesmo sem o THINK ter pesquisado pessoas", async () => {
    const r: any = await call(fakeSb({ people: [{ id: "p1", name: "Manuel Silva" }] }), {});
    expect(r.data.needsPersonConfirmation).toBe(true);
  });

  it("golden 3 — dois Manueis pedem escolha com contexto", async () => {
    const r: any = await call(fakeSb({ people: [
      { id: "p1", name: "Manuel", phone: "912 000 111", relationship_type: "comprador" },
      { id: "p2", name: "Manuel Silva", phone: "913 000 222", relationship_type: "proprietario" },
    ] }), {});
    expect(r.data.mode).toBe("choose");
    expect(r.data.suggestions).toHaveLength(2);
  });

  it("golden 4 — correspondência parcial pergunta, nunca liga sozinha", async () => {
    const captured: any = {};
    const r: any = await call(fakeSb({ people: [{ id: "p9", name: "Manuel Silva" }], captured }), {});
    expect(r.data.mode).toBe("confirm_partial");
    expect(captured.insert).toBeUndefined();
  });

  it("golden 5 — telefone inequívoco liga automaticamente", async () => {
    const captured: any = {};
    const r: any = await call(
      fakeSb({ phones: [{ person_id: "p7", people: { id: "p7", name: "Manuel Silva" } }], captured }),
      { title: "Ligar ao 912345678 sobre a visita" },
    );
    expect(r.ok).toBe(true);
    expect(captured.insert?.person_id).toBe("p7");
  });

  it("golden 6 — pessoa inexistente pergunta se é contacto novo", async () => {
    const captured: any = {};
    const r: any = await call(fakeSb({ people: [], captured }), { title: "Visita com o Joaquim" });
    expect(r.data.mode).toBe("new");
    expect(r.data.personName).toBe("Joaquim");
    expect(captured.insert).toBeUndefined();
  });

  it("golden 7 — candidato rejeitado não volta a ser proposto", async () => {
    const r: any = await call(
      fakeSb({ people: [{ id: "p1", name: "Manuel" }] }),
      {},
      { rejectedPersonIds: ["p1"] },
    );
    expect(r.data.mode).toBe("new");
    expect((r.data.suggestions ?? []).map((s: any) => s.id)).not.toContain("p1");
  });

  it("golden 8 — pessoas de outra conta nunca são candidatas", async () => {
    const seen: Array<Record<string, any>> = [];
    const r: any = await call(
      fakeSb({ people: [], onSelect: (t, f) => { if (t === "people") seen.push({ ...f }); } }),
      {},
    );
    expect(r.data.mode).toBe("new");
    expect(seen.every((f) => f.user_id === "u1")).toBe(true);
  });

  it("sem pessoa por decisão explícita fica registado, não é null silencioso", async () => {
    const captured: any = {};
    const r: any = await call(fakeSb({ captured }), {}, { skipPersonResolution: true });
    expect(r.ok).toBe(true);
    expect(captured.insert?.person_id).toBeNull();
    expect(String(captured.insert?.notes)).toContain("Sem contacto associado");
  });
});

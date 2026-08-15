// GOLDEN — resolução obrigatória de pessoa em create_event ("Silva").
//
// Caso real (15/08): "Marca visita com o Silva amanhã às 14:00" agendou logo
// com a "Ana Silva", sem perguntar. O apelido isolado é correspondência
// parcial e tem de passar pelo mesmo guard do seguimento.
import { describe, it, expect, vi } from "vitest";
import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";

vi.mock("@/lib/calendar/sync.server", () => ({ pushEventToProviders: async () => {} }));

function fakeSb(opts: { people?: any[]; phones?: any[]; captured?: { insert?: any } }) {
  const build = (table: string) => {
    const state: any = { op: null, payload: null, filters: {} };
    const rowsFor = () => {
      if (table === "people") return opts.people ?? [];
      if (table === "person_phones") return opts.phones ?? [];
      return [];
    };
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => { state.filters[col] = val; return chain; },
      ilike: () => chain, or: () => chain, in: () => chain, is: () => chain,
      gte: () => chain, lt: () => chain, lte: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (state.op === "insert" && table === "follow_ups" && opts.captured && !opts.captured.insert) {
          opts.captured.insert = state.payload;
        }
        return { data: { id: "e1", ...state.payload }, error: null };
      },
      insert: (row: any) => { state.op = "insert"; state.payload = row; return chain; },
      update: () => chain, upsert: () => chain,
    };
    chain.then = (resolve: any) => resolve({ data: state.op ? [] : rowsFor(), error: null });
    return chain;
  };
  return { from: (t: string) => build(t) } as any;
}

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx = (sb: any, extra: any = {}) => ({ supabase: sb, userId: "u1", channel: "whatsapp", ...extra }) as any;
const call = (sb: any, args: any, extra: any = {}) =>
  dispatchToolCall(ctx(sb, extra), "create_event", JSON.stringify({
    title: "Marca visita com o Silva", event_type: "visita",
    date: "2026-08-16", start_time: "14:00", ...args,
  }));

describe("resolução obrigatória de pessoa em create_event", () => {
  for (const [variant, proposed] of [
    ["sem id proposto", {}],
    ["com person_id proposto pelo modelo", { person_id: ANA }],
  ] as Array<[string, Record<string, any>]>) {
    it(`apelido isolado ("Silva" → Ana Silva) pede confirmação e não agenda (${variant})`, async () => {
      const captured: any = {};
      const r: any = await call(
        fakeSb({ captured, people: [{ id: ANA, name: "Ana Silva", phone: "+351912333444", relationship_type: "proprietario" }] }),
        { ...proposed },
      );
      expect(r.ok).toBe(true);
      expect(r.data.needsPersonConfirmation).toBe(true);
      expect(r.data.mode).toBe("confirm_partial");
      expect(r.data.suggestions[0].id).toBe(ANA);
      expect(r.data.incoming.person_id).toBeNull();
      expect(captured.insert).toBeUndefined();
    });

    it(`primeiro nome isolado ("Ana" → Ana Silva) também pede confirmação (${variant})`, async () => {
      const captured: any = {};
      const r: any = await call(
        fakeSb({ captured, people: [{ id: ANA, name: "Ana Silva" }] }),
        { title: "Marca visita com a Ana", ...proposed },
      );
      expect(r.data.mode).toBe("confirm_partial");
      expect(captured.insert).toBeUndefined();
    });
  }

  it("nome exacto único pede confirmação leve, não agenda às cegas", async () => {
    const captured: any = {};
    const r: any = await call(fakeSb({ captured, people: [{ id: ANA, name: "Silva" }] }), {});
    expect(r.data.mode).toBe("confirm_exact");
    expect(captured.insert).toBeUndefined();
  });

  it("telefone inequívoco liga automaticamente e agenda", async () => {
    const captured: any = {};
    const r: any = await call(
      fakeSb({ captured, phones: [{ person_id: "p7", people: { id: "p7", name: "Ana Silva" } }] }),
      { title: "Visita marcada pelo 912345678" },
    );
    expect(r.ok).toBe(true);
    expect(captured.insert?.person_id).toBe("p7");
  });

  it("depois da escolha do consultor, agenda sem voltar a perguntar", async () => {
    const captured: any = {};
    const r: any = await call(
      fakeSb({ captured, people: [{ id: ANA, name: "Ana Silva" }] }),
      { person_id: ANA },
      { skipPersonResolution: true, skipDuplicateCheck: true },
    );
    expect(r.ok).toBe(true);
    expect(captured.insert?.person_id).toBe(ANA);
  });
});

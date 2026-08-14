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


const UUID = {
  p1: "11111111-1111-4111-8111-111111111111",
  p2: "22222222-2222-4222-8222-222222222222",
  p9: "99999999-9999-4999-8999-999999999999",
  pa: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  pm1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  pm2: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  pm3: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

const ctx = (sb: any, extra: any = {}) => ({ supabase: sb, userId: "u1", channel: "whatsapp", ...extra }) as any;
const call = (sb: any, args: any, extra: any = {}) =>
  dispatchToolCall(ctx(sb, extra), "create_follow_up", JSON.stringify({
    title: "Visita com o Manuel", type: "tarefa", due_date: "2026-08-15", due_time: "10:00", ...args,
  }));

describe("resolução obrigatória de pessoa em create_follow_up", () => {
  // O motor v3 pesquisa pessoas e muitas vezes já propõe `person_id`. Cada
  // golden de ambiguidade corre nas duas variantes: sem id (camada de domínio
  // isolada) e com id proposto pelo modelo (caminho real de produção).
  const modes: Array<[string, Record<string, any>]> = [
    ["sem id proposto", {}],
    ["com person_id proposto pelo modelo", { person_id: UUID.p1 }],
  ];

  for (const [variant, proposed] of modes) {
    it(`golden 1 — nome exacto único pede confirmação leve e não escreve (${variant})`, async () => {
      const captured: any = {};
      const r: any = await call(fakeSb({ people: [{ id: UUID.p1, name: "Manuel" }], captured }), { ...proposed });
      expect(r.ok).toBe(true);
      expect(r.data.needsPersonConfirmation).toBe(true);
      expect(r.data.mode).toBe("confirm_exact");
      expect(r.data.incoming.person_id).toBeNull();
      expect(captured.insert).toBeUndefined();
    });

    it(`golden 2 — resolve mesmo sem o THINK ter pesquisado pessoas (${variant})`, async () => {
      const r: any = await call(fakeSb({ people: [{ id: UUID.p1, name: "Manuel Silva" }] }), { ...proposed });
      expect(r.data.needsPersonConfirmation).toBe(true);
    });

    it(`golden 3 — dois Manueis pedem escolha com contexto (${variant})`, async () => {
      const captured: any = {};
      const r: any = await call(fakeSb({ captured, people: [
        { id: UUID.p1, name: "Manuel", phone: "912 000 111", relationship_type: "comprador" },
        { id: UUID.p2, name: "Manuel Silva", phone: "913 000 222", relationship_type: "proprietario" },
      ] }), { ...proposed });
      expect(r.data.mode).toBe("choose");
      expect(r.data.suggestions).toHaveLength(2);
      expect(captured.insert).toBeUndefined();
    });

    it(`golden 4 — correspondência parcial pergunta, nunca liga sozinha (${variant})`, async () => {
      const captured: any = {};
      const r: any = await call(
        fakeSb({ people: [{ id: UUID.p9, name: "Manuel Silva" }], captured }),
        proposed.person_id ? { person_id: UUID.p9 } : {},
      );
      expect(r.data.mode).toBe("confirm_partial");
      expect(captured.insert).toBeUndefined();
    });
  }

  // Casos reais observados no WhatsApp em 14/08 (motor v3 propôs o id certo
  // e o seguimento foi escrito sem qualquer confirmação).
  it("golden 9 — \"Ana\" com única Ana Silva pede confirm_partial mesmo com id proposto", async () => {
    const captured: any = {};
    const r: any = await call(
      fakeSb({ captured, people: [{ id: UUID.pa, name: "Ana Silva", phone: "+351912333444", relationship_type: "proprietario" }] }),
      { title: "Marca visita com a Ana", person_id: UUID.pa },
    );
    expect(r.data.needsPersonConfirmation).toBe(true);
    expect(r.data.mode).toBe("confirm_partial");
    expect(r.data.suggestions[0].id).toBe(UUID.pa);
    expect(r.data.proposedPersonId).toBe(UUID.pa);
    expect(captured.insert).toBeUndefined();
  });

  it("golden 10 — \"Manuela\" com Manuela e Maria Manuela pede choose mesmo com id proposto", async () => {
    const captured: any = {};
    const r: any = await call(
      fakeSb({ captured, people: [
        { id: UUID.pm1, name: "Manuela", phone: "932456789" },
        { id: UUID.pm2, name: "Maria Manuela", phone: "+351912333411" },
        { id: UUID.pm3, name: "Manuel", phone: "932451222" },
      ] }),
      { title: "Ligar à Manuela", type: "chamada", person_id: UUID.pm1 },
    );
    expect(r.data.mode).toBe("choose");
    expect((r.data.suggestions ?? []).map((s: any) => s.id).sort()).toEqual([UUID.pm1, UUID.pm2].sort());
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
      fakeSb({ people: [{ id: UUID.p1, name: "Manuel" }] }),
      {},
      { rejectedPersonIds: [UUID.p1] },
    );
    expect(r.data.mode).toBe("new");
    expect((r.data.suggestions ?? []).map((s: any) => s.id)).not.toContain(UUID.p1);
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

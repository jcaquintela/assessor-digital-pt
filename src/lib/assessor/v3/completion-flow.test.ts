// Caso real: "O estudo de mercado está tratado" foi ignorado por causa da
// instrução vizinha ambígua e o lembrete voltou a disparar dias depois.

import { describe, expect, it, vi } from "vitest";
import { COMPLETED_STATUS, COMPLETED_OUTCOME } from "./completion-intent";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

const USER = "00000000-0000-4000-8000-000000000011";

function makeDb() {
  const follow_ups: any[] = [
    { id: "fu-estudo", user_id: USER, title: "Estudo de mercado do T2 de Consortes", due_date: "2026-02-10T09:00:00Z", due_time: "09:00", status: "agendado", outcome: null, archived_at: null },
    { id: "fu-visita", user_id: USER, title: "Visita ao T2 de Consortes", due_date: "2026-02-10T18:00:00Z", due_time: "18:00", status: "agendado", outcome: null, archived_at: null },
  ];
  const routines: any[] = [
    { id: "rot-1", user_id: USER, title: "Estudo de mercado semanal", active: true },
  ];
  const state: Record<string, any[]> = { follow_ups, routines };

  function table(name: string) {
    const rows = state[name] ?? (state[name] = []);
    const filters: Array<(r: any) => boolean> = [];
    let mode: "select" | "update" = "select";
    let payload: any = null;
    const run = () => {
      const out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === "update") { for (const r of out) Object.assign(r, payload); }
      return out;
    };
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), q),
      is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), q),
      not: () => q, gte: () => q, lte: () => q, lt: () => q, order: () => q,
      limit: (n: number) => Promise.resolve({ data: run().slice(0, n), error: null }),
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      update: (p: any) => { mode = "update"; payload = p; return q; },
      insert: async (row: any) => { rows.push(row); return { data: null, error: null }; },
      upsert: async () => ({ error: null }),
      delete: () => q,
      then: (ok: any, err: any) => Promise.resolve({ data: run(), error: null }).then(ok, err),
    };
    return q;
  }
  return { follow_ups, routines, supabase: { from: (n: string) => table(n) } as any };
}

const ctx = (db: ReturnType<typeof makeDb>) => ({ supabase: db.supabase, userId: USER, channel: "whatsapp" as const });

describe("complete_follow_up", () => {
  it("golden 3 — fecha mesmo o seguimento pelo assunto dito em voz alta", async () => {
    const db = makeDb();
    const { TOOL_REGISTRY } = await import("../v2/domain.server");
    const r = await TOOL_REGISTRY["complete_follow_up"]!(ctx(db), { subject_hint: "estudo mercado" });
    expect(r.ok).toBe(true);
    expect((r.data as any).completed).toBe(1);
    const estudo = db.follow_ups.find((f) => f.id === "fu-estudo")!;
    expect(estudo.status).toBe(COMPLETED_STATUS);
    expect(estudo.outcome).toBe(COMPLETED_OUTCOME);
    // A instrução vizinha continua intacta: fechar uma coisa não mexe na outra.
    expect(db.follow_ups.find((f) => f.id === "fu-visita")!.status).toBe("agendado");
  });

  it("devolve a rotina associada para o motor perguntar, sem a desligar", async () => {
    const db = makeDb();
    const { TOOL_REGISTRY } = await import("../v2/domain.server");
    const r = await TOOL_REGISTRY["complete_follow_up"]!(ctx(db), { subject_hint: "estudo mercado" });
    expect((r.data as any).recurring?.title).toBe("Estudo de mercado semanal");
    expect(db.routines[0]!.active).toBe(true);
  });

  it("sem assunto nem ids não fecha nada", async () => {
    const db = makeDb();
    const { TOOL_REGISTRY } = await import("../v2/domain.server");
    const r = await TOOL_REGISTRY["complete_follow_up"]!(ctx(db), {});
    expect(r.ok).toBe(false);
    expect(db.follow_ups.every((f) => f.status === "agendado")).toBe(true);
  });

  it("assunto sem correspondência não inventa uma conclusão", async () => {
    const db = makeDb();
    const { TOOL_REGISTRY } = await import("../v2/domain.server");
    const r = await TOOL_REGISTRY["complete_follow_up"]!(ctx(db), { subject_hint: "contrato do Nuno" });
    expect((r.data as any).completed).toBe(0);
    expect(db.follow_ups.every((f) => f.status === "agendado")).toBe(true);
  });
});

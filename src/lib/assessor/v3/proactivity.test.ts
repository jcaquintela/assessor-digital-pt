import { describe, it, expect, vi } from "vitest";
import { generateNudgesForUser } from "./proactivity.server";

function fakeSupabase(fixtures: Record<string, any[]>) {
  const chain: any = {
    _table: "",
    _rows: [] as any[],
    from(t: string) { this._table = t; this._rows = fixtures[t] ?? []; return this; },
    select(_s: string, opts?: any) { if (opts?.head && opts?.count === "exact") { this._headCount = true; } return this; },
    eq(_k: string, _v: any) { return this; },
    in(_k: string, _v: any) { return this; },
    not(_k: string, _op: string, _v: any) { return this; },
    lt(_k: string, _v: any) { return this; },
    lte(_k: string, _v: any) { return this; },
    gte(_k: string, _v: any) { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle() { return Promise.resolve({ data: this._rows[0] ?? null }); },
    then(res: any) {
      if (this._headCount) return res({ count: this._rows.length });
      return res({ data: this._rows });
    },
  };
  return chain;
}

describe("proactivity — regras", () => {
  it("não gera nudges quando quota diária esgotada", async () => {
    const sup = fakeSupabase({
      assessor_nudges: new Array(3).fill({ id: "n" }),
    });
    const out = await generateNudgesForUser(sup as any, "u1", { maxPerDay: 3 });
    expect(out).toEqual([]);
  });

  it("gera nudge para follow-up vencido", async () => {
    const sup = fakeSupabase({
      assessor_nudges: [],
      opportunities: [],
      follow_ups: [{ id: "f1", title: "Ligar ao João", due_date: new Date(Date.now() - 5 * 864e5).toISOString(), status: "pending" }],
      properties: [],
      assessor_messages: [{ created_at: new Date().toISOString() }],
    });
    const out = await generateNudgesForUser(sup as any, "u1");
    expect(out.some((n) => n.kind === "followup_overdue")).toBe(true);
  });

  it("cada nudge tem dedupe_key único e resposta sanitizada", async () => {
    const sup = fakeSupabase({
      assessor_nudges: [],
      opportunities: [],
      follow_ups: [{ id: "f1", title: "Enviar CPU", due_date: new Date(Date.now() - 5 * 864e5).toISOString(), status: "pending" }],
      properties: [],
      assessor_messages: [{ created_at: new Date().toISOString() }],
    });
    const out = await generateNudgesForUser(sup as any, "u1");
    expect(out[0].dedupe_key).toMatch(/^followup_overdue:f1:/);
    expect(out[0].suggested_reply.toLowerCase()).not.toContain("payload");
  });
});
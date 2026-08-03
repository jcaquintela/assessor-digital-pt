import { describe, it, expect } from "vitest";
import {
  createPendingAction,
  findActivePendingAction,
  markPendingActionStatus,
} from "./memory.server";

type Row = Record<string, any>;

function fakeSupabase() {
  const tables: Record<string, Row[]> = { pending_actions: [], miscellaneous_items: [] };
  let seq = 0;
  const make = (name: string) => {
    let rows = () => tables[name]!;
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row | null = null;
    let limit: number | null = null;
    const api: any = {
      select() { return api; },
      eq(col: string, v: any) { filters.push((r) => r[col] === v); return api; },
      in(col: string, v: any[]) { filters.push((r) => v.includes(r[col])); return api; },
      is(col: string, v: any) { filters.push((r) => r[col] === v); return api; },
      order(col: string, o: any) {
        const asc = o?.ascending !== false;
        const prev = rows;
        rows = () => [...prev()].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1));
        return api;
      },
      limit(n: number) { limit = n; return api; },
      update(p: Row) { mode = "update"; patch = p; return api; },
      insert(p: Row) { mode = "insert"; inserted = { id: `id${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...p }; tables[name]!.push(inserted); return api; },
      maybeSingle() { return api.then ? api : api; },
      single() { return Promise.resolve({ data: inserted, error: null }); },
      then(res: any) { return Promise.resolve(api._run()).then(res); },
      _run() {
        const matched = rows().filter((r) => filters.every((f) => f(r)));
        if (mode === "update") { matched.forEach((r) => Object.assign(r, patch)); return { data: matched, error: null }; }
        if (mode === "insert") return { data: inserted, error: null };
        return { data: limit ? matched.slice(0, limit) : matched, error: null };
      },
    };
    api.maybeSingle = () => Promise.resolve({ data: api._run().data?.[0] ?? null, error: null });
    return api;
  };
  return { from: (name: string) => make(name), _tables: tables };
}

describe("ranhuras de rascunhos pendentes", () => {
  it("um 'não' ao agendamento não destrói a lista de documentos", async () => {
    const db = fakeSupabase();
    const base = { userId: "u1", channel: "whatsapp", originalContent: "x", payload: {} };

    await createPendingAction(db, { ...base, intent: "choosing_document", payload: { candidates: [{ id: "f1" }] } });
    await createPendingAction(db, { ...base, intent: "create_follow_up" });

    const docs = await findActivePendingAction(db, "u1", "whatsapp", "documents");
    const main = await findActivePendingAction(db, "u1", "whatsapp");
    expect(docs?.intent).toBe("choosing_document");
    expect(main?.intent).toBe("create_follow_up");

    // "não" resolve-se contra o agendamento apenas
    await markPendingActionStatus(db, main!.id, "cancelled");

    const stillThere = await findActivePendingAction(db, "u1", "whatsapp", "documents");
    expect(stillThere?.intent).toBe("choosing_document");
    expect((stillThere!.structured_payload as any).candidates).toHaveLength(1);
    expect(await findActivePendingAction(db, "u1", "whatsapp")).toBeNull();
  });

  it("novo rascunho substitui apenas o da mesma ranhura", async () => {
    const db = fakeSupabase();
    const base = { userId: "u1", channel: "whatsapp", originalContent: "x", payload: {} };
    await createPendingAction(db, { ...base, intent: "choosing_document" });
    await createPendingAction(db, { ...base, intent: "create_follow_up" });
    await createPendingAction(db, { ...base, intent: "create_person" });
    expect((await findActivePendingAction(db, "u1", "whatsapp"))?.intent).toBe("create_person");
    expect((await findActivePendingAction(db, "u1", "whatsapp", "documents"))?.intent).toBe("choosing_document");
  });
});

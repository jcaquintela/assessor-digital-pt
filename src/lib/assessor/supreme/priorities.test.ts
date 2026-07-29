import { describe, it, expect } from "vitest";
import { computePriorities } from "./priorities.server";

function makeSupabase(rows: Record<string, any[]>) {
  const build = (table: string) => {
    let data = rows[table] ?? [];
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { data = data.filter((r) => r[col] === val); return api; },
      neq: (col: string, val: any) => { data = data.filter((r) => r[col] !== val); return api; },
      is: (col: string, val: any) => { data = data.filter((r) => (r[col] ?? null) === val); return api; },
      not: () => api,
      in: (col: string, vals: any[]) => { data = data.filter((r) => vals.includes(r[col])); return api; },
      lte: (col: string, val: any) => { data = data.filter((r) => new Date(r[col]) <= new Date(val)); return api; },
      order: () => api,
      limit: () => api,
      then: (resolve: any, reject: any) => Promise.resolve({ data }).then(resolve, reject),
    };
    return api;
  };
  return { from: (t: string) => build(t) };
}

describe("computePriorities", () => {
  it("sinaliza follow-up atrasado com razão legível", async () => {
    const supabase = makeSupabase({
      follow_ups: [{
        id: "f1", title: "Ligar ao Paulo", type: "Tarefa",
        due_date: new Date(Date.now() - 2 * 864e5).toISOString(),
        status: "Pendente", priority: "Alta", person_id: "p1", outcome: null,
      }],
      opportunities: [],
      people: [{ id: "p1", name: "Paulo" }],
    });
    const items = await computePriorities(supabase as any, "u1");
    expect(items.length).toBe(1);
    expect(items[0].subject_type).toBe("follow_up");
    expect(items[0].reasons.some((r) => r.includes("atrasado"))).toBe(true);
    expect(items[0].entity_label).toBe("Paulo");
  });

  it("prioridade alta fica em primeiro", async () => {
    const supabase = makeSupabase({
      follow_ups: [
        { id: "f1", title: "A", type: "Tarefa", due_date: new Date().toISOString(), status: "Pendente", priority: "Média", outcome: null },
        { id: "f2", title: "B", type: "Tarefa", due_date: new Date(Date.now() - 5 * 864e5).toISOString(), status: "Pendente", priority: "Alta", outcome: null },
      ],
      opportunities: [],
      people: [],
    });
    const items = await computePriorities(supabase as any, "u1");
    expect(items[0].subject_id).toBe("f2");
  });
});

import { it as it2 } from "vitest";
it2("debug", async () => {
  const supabase = makeSupabase({
    follow_ups: [{
      id: "f1", user_id: "u1", title: "x", type: "Tarefa",
      due_date: new Date(Date.now() - 2*864e5).toISOString(),
      status: "Pendente", priority: "Alta", person_id: null, outcome: null,
    }],
    opportunities: [],
    people: [],
  });
  const r = await supabase.from("follow_ups").select().eq("user_id","u1").neq("status","Concluído").is("outcome", null).lte("due_date", new Date(Date.now()+7*864e5).toISOString()).order().limit();
  console.log("R", r);
});

import { describe, it, expect } from "vitest";
import { computePriorities, findAwaitingOutcome } from "./priorities.server";

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
      lt: (col: string, val: any) => { data = data.filter((r) => new Date(r[col]) < new Date(val)); return api; },
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
        id: "f1", user_id: "u1", title: "Ligar ao Paulo", type: "Tarefa",
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
        { id: "f1", user_id: "u1", title: "A", type: "Tarefa", due_date: new Date().toISOString(), status: "Pendente", priority: "Média", outcome: null },
        { id: "f2", user_id: "u1", title: "B", type: "Tarefa", due_date: new Date(Date.now() - 5 * 864e5).toISOString(), status: "Pendente", priority: "Alta", outcome: null },
      ],
      opportunities: [],
      people: [],
    });
    const items = await computePriorities(supabase as any, "u1");
    expect(items[0].subject_id).toBe("f2");
  });
});

describe("findAwaitingOutcome", () => {
  it("não pede check-in para um Almoço sem contexto comercial", async () => {
    const supabase = makeSupabase({
      follow_ups: [{
        id: "almoco-1",
        user_id: "u1",
        title: "Almoço",
        type: "evento",
        due_date: new Date(Date.now() - 60 * 60_000).toISOString(),
        status: "agendado",
        outcome: null,
        person_id: null,
        related_property_id: null,
        opportunity_id: null,
        source_channel: "google_calendar",
      }],
      people: [],
    });

    await expect(findAwaitingOutcome(supabase as any, "u1")).resolves.toEqual([]);
  });

  it("mantém o check-in para um compromisso ligado a uma Pessoa", async () => {
    const supabase = makeSupabase({
      follow_ups: [{
        id: "visita-1",
        user_id: "u1",
        title: "Visita ao apartamento",
        type: "visita",
        due_date: new Date(Date.now() - 60 * 60_000).toISOString(),
        status: "agendado",
        outcome: null,
        person_id: "p1",
        related_property_id: null,
        opportunity_id: null,
      }],
      people: [{ id: "p1", name: "Sr. Almeida" }],
    });

    const result = await findAwaitingOutcome(supabase as any, "u1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "visita-1", entity_label: "Sr. Almeida" });
  });
});


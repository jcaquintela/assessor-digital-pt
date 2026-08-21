// Golden: o nudge de "seguimento atrasado" na conversa lê da MESMA fonte que
// /hoje e o briefing (computePriorities). Eventos importados do calendário
// externo não geram nudge; seguimentos internos atrasados continuam a gerar.
import { describe, it, expect } from "vitest";
import { generateNudgesForUser } from "./proactivity.server";

const diasAtras = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

function fakeSupabase(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = (tables[table] ?? []).map((r) => ({ ...r }));
      let head = false;
      const b: any = {
        select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return b; },
        eq: (c: string, v: any) => { rows = rows.filter((r) => r[c] === v); return b; },
        neq: (c: string, v: any) => { rows = rows.filter((r) => r[c] !== v); return b; },
        is: (c: string, v: any) => { rows = rows.filter((r) => (r[c] ?? null) === v); return b; },
        in: (c: string, vs: any[]) => { rows = rows.filter((r) => vs.includes(r[c])); return b; },
        lt: (c: string, v: any) => { rows = rows.filter((r) => r[c] != null && new Date(r[c]) < new Date(v)); return b; },
        lte: (c: string, v: any) => { rows = rows.filter((r) => r[c] != null && new Date(r[c]) <= new Date(v)); return b; },
        gte: (c: string, v: any) => { rows = rows.filter((r) => r[c] != null && new Date(r[c]) >= new Date(v)); return b; },
        not: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null }),
        then: (res: any) => res(head ? { count: rows.length, data: null } : { data: rows }),
      };
      return b;
    },
  };
}

const baseTables = {
  assessor_nudges: [],
  opportunities: [],
  people: [],
  properties: [],
  uploaded_files: [],
  assessor_messages: [],
  miscellaneous_items: [],
};

describe("nudge de seguimento atrasado — fonte única", () => {
  it("evento importado do calendário externo em atraso não gera nudge", async () => {
    const s = fakeSupabase({
      ...baseTables,
      follow_ups: [{
        id: "f-cal", user_id: "u1", title: "Reunião importada", type: "evento",
        due_date: diasAtras(6), due_time: "09:00", status: "agendado", outcome: null,
        archived_at: null, person_id: null, opportunity_id: null,
      }],
      calendar_event_links: [{ follow_up_id: "f-cal", provider: "microsoft_outlook", deleted: false, user_id: "u1" }],
    });
    const drafts = await generateNudgesForUser(s as any, "u1");
    expect(drafts.filter((d) => d.kind === "followup_overdue")).toHaveLength(0);
  });

  it("seguimento próprio atrasado continua a gerar nudge", async () => {
    const s = fakeSupabase({
      ...baseTables,
      follow_ups: [{
        id: "f-1", user_id: "u1", title: "Ligar ao Sr. Nogueira", type: "tarefa",
        due_date: diasAtras(6), due_time: null, status: "pendente", outcome: null,
        archived_at: null, person_id: null, opportunity_id: null,
      }],
      calendar_event_links: [],
    });
    const drafts = await generateNudgesForUser(s as any, "u1");
    const overdue = drafts.filter((d) => d.kind === "followup_overdue");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].subject_id).toBe("f-1");
  });
});

import { describe, it, expect } from "vitest";
import { computePriorities } from "./priorities.server";
import { eventWindow, isEventOver, isWindowOver } from "./event-window";

// Agosto = Lisboa em UTC+1.
const at = (hhmm: string) => new Date(`2026-08-10T${hhmm}:00+01:00`);
const HOJE = "2026-08-10T00:00:00+01:00";

function makeSupabase(rows: Record<string, any[]>) {
  const build = (table: string) => {
    let data = rows[table] ?? [];
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { data = data.filter((r) => r[col] === val); return api; },
      is: (col: string, val: any) => { data = data.filter((r) => (r[col] ?? null) === val); return api; },
      not: () => api,
      in: (col: string, vals: any[]) => { data = data.filter((r) => vals.includes(r[col])); return api; },
      lte: (col: string, val: any) => { data = data.filter((r) => new Date(r[col]) <= new Date(val)); return api; },
      gte: (col: string, val: any) => { data = data.filter((r) => new Date(r[col]) >= new Date(val)); return api; },
      lt: (col: string, val: any) => { data = data.filter((r) => new Date(r[col]) < new Date(val)); return api; },
      order: () => api,
      limit: () => api,
      then: (resolve: any, reject: any) => Promise.resolve({ data }).then(resolve, reject),
    };
    return api;
  };
  return { from: (t: string) => build(t) };
}

const reuniao = {
  id: "f1", user_id: "u1", title: "Reunião de equipa Level Up", type: "reuniao",
  due_date: HOJE, due_time: "10:00", status: "pendente", outcome: null, archived_at: null,
};
const atrasado = {
  id: "f2", user_id: "u1", title: "Ligar ao Paulo", type: "tarefa",
  due_date: "2026-08-07T09:00:00+01:00", status: "pendente", outcome: null, archived_at: null,
};

describe("janela temporal do compromisso", () => {
  it("calcula fim = início + 1h quando não há duração", () => {
    const w = eventWindow({ due_date: HOJE, due_time: "10:00" });
    expect(w.startIso).toBe("2026-08-10T09:00:00.000Z");
    expect(w.endIso).toBe("2026-08-10T10:00:00.000Z");
  });
  it("sem hora só expira quando o dia de Lisboa passa", () => {
    expect(isEventOver({ due_date: HOJE }, at("23:00"))).toBe(false);
    expect(isEventOver({ due_date: HOJE }, new Date("2026-08-11T08:00:00+01:00"))).toBe(true);
  });
});

describe("golden — cartão de preparação obsoleto", () => {
  it("1) às 9:00 o cartão de preparação aparece", async () => {
    const db = makeSupabase({ follow_ups: [reuniao], opportunities: [] });
    const items = await computePriorities(db as any, "u1", { now: at("09:00") });
    expect(items[0].action).toBe("Preparar o compromisso das 10:00: Reunião de equipa Level Up");
    expect(items[0].event_end_at).toBe("2026-08-10T10:00:00.000Z");
  });

  it("2) às 11:30 o cartão desaparece e o slot passa ao próximo item relevante", async () => {
    const db = makeSupabase({ follow_ups: [reuniao, atrasado], opportunities: [] });
    const items = await computePriorities(db as any, "u1", { now: at("11:30") });
    expect(items.some((i) => i.action.startsWith("Preparar o compromisso"))).toBe(false);
    expect(items[0].action).toBe("Ligar ao Paulo");
  });

  it("2b) sem mais nada relevante, o cartão simplesmente não aparece", async () => {
    const db = makeSupabase({ follow_ups: [reuniao], opportunities: [] });
    expect(await computePriorities(db as any, "u1", { now: at("11:30") })).toEqual([]);
  });

  it("3) validação repetida na renderização: nunca persiste após reload", () => {
    const gerado = eventWindow({ due_date: HOJE, due_time: "10:00" });
    expect(isWindowOver(gerado.endIso, at("09:00"))).toBe(false);
    expect(isWindowOver(gerado.endIso, at("11:30"))).toBe(true);
    expect(isWindowOver(null, at("23:00"))).toBe(false);
  });

  it("4) compromisso de amanhã não entra nas prioridades de hoje", async () => {
    const amanha = { ...reuniao, id: "f3", due_date: "2026-08-11T00:00:00+01:00" };
    const db = makeSupabase({ follow_ups: [amanha, atrasado], opportunities: [] });
    const items = await computePriorities(db as any, "u1", { now: at("09:00") });
    expect(items.some((i) => i.subject_id === "f3")).toBe(false);
    expect(items[0].action).toBe("Ligar ao Paulo");
  });

  it("durante o compromisso ainda conta (só expira no fim)", async () => {
    const db = makeSupabase({ follow_ups: [reuniao], opportunities: [] });
    const items = await computePriorities(db as any, "u1", { now: at("10:30") });
    expect(items.length).toBe(1);
  });
});

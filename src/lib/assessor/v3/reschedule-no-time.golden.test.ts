// Golden: "Proposta à Joana passou para segunda-feira" (13/09).
//
// A remarcação exigia hora. O consultor não disse hora nenhuma — a forma mais
// natural de falar — e a escrita foi recusada antes de chegar à base de dados,
// duas vezes, com a resposta genérica "não consegui guardar".

import { describe, it, expect } from "vitest";
import { RescheduleReminderArgs } from "../v2/tools";
import { rescheduleReminder } from "./reminders.server";
import { explainToolFailure } from "./failure-reply";

type Row = Record<string, any>;

/** Fake mínimo: só o que o caminho de fallback de follow_ups usa. */
function fakeSupabase(seed: { reminders?: Row[]; follow_ups?: Row[] }) {
  const state = {
    reminders: [...(seed.reminders ?? [])],
    follow_ups: [...(seed.follow_ups ?? [])],
  } as Record<string, Row[]>;

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "update" = "select";
    let payload: any = null;
    const api: any = {
      select() { return api; },
      eq(c: string, v: any) { filters.push((r) => r[c] === v); return api; },
      in(c: string, v: any[]) { filters.push((r) => v.includes(r[c])); return api; },
      ilike(c: string, v: string) {
        const needle = v.replace(/%/g, "").toLowerCase();
        const base = c.endsWith("_norm") ? c.slice(0, -5) : c;
        filters.push((r) => String(r[c] ?? r[base] ?? "")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(needle));
        return api;
      },
      order() { return api; },
      limit() { return api; },
      update(p: any) { mode = "update"; payload = p; return api; },
      single() { return api._exec(); },
      maybeSingle() { return api._exec(); },
      then(ok: any, err: any) { return api._exec().then(ok, err); },
      _exec() {
        const rows = (state[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (mode === "update") { for (const r of rows) Object.assign(r, payload); }
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return api;
  }
  return { from, _state: state };
}

const USER = "08d24695-a12c-4954-887a-81a71215a87e";

function joana(extra: Row = {}): Row {
  return {
    id: "4939c86e-893d-4e1b-b3d4-4c1e7c4e1b3d",
    user_id: USER,
    title: "Apresentar proposta à Joana",
    status: "pendente",
    due_date: "2026-09-10",
    due_time: null,
    ...extra,
  };
}

describe("remarcação sem hora", () => {
  it("G1 — caso real: 'passou para segunda-feira' guarda na nova data, sem hora", async () => {
    const args = RescheduleReminderArgs.safeParse({
      subject_hint: "Proposta à Joana",
      new_date: "2026-09-14",
      timezone: "Europe/Lisbon",
    });
    expect(args.success).toBe(true);

    const db = fakeSupabase({ follow_ups: [joana()] });
    const r = await rescheduleReminder(db, {
      userId: USER,
      channel: "whatsapp",
      subject_hint: "Proposta à Joana",
      new_date: "2026-09-14",
    });
    expect(r.ok).toBe(true);
    const row = db._state.follow_ups[0];
    expect(String(row.due_date).slice(0, 10)).toBe("2026-09-14");
    expect(row.due_time ?? null).toBeNull();
  });

  it("G2 — com hora explícita continua a funcionar", async () => {
    const db = fakeSupabase({ follow_ups: [joana()] });
    const r = await rescheduleReminder(db, {
      userId: USER,
      channel: "whatsapp",
      subject_hint: "Proposta à Joana",
      new_date: "2026-09-14",
      new_time: "15:30",
    });
    expect(r.ok).toBe(true);
    expect(db._state.follow_ups[0].due_time).toBe("15:30");
  });

  it("G3 — item que já tinha hora mantém-na na nova data", async () => {
    const db = fakeSupabase({ follow_ups: [joana({ due_time: "11:00" })] });
    const r = await rescheduleReminder(db, {
      userId: USER,
      channel: "whatsapp",
      subject_hint: "Proposta à Joana",
      new_date: "2026-09-14",
    });
    expect(r.ok).toBe(true);
    const row = db._state.follow_ups[0];
    expect(row.due_time).toBe("11:00");
    // 11:00 em Lisboa (Verão, UTC+1) = 10:00 UTC no dia 14.
    expect(String(row.due_date)).toContain("2026-09-14T10:00");
  });

  it("G4 — falha por falta de informação pergunta o que falta", () => {
    const reply = explainToolFailure([
      { name: "create_event", ok: false, error: "invalid_args:start_time: Invalid input" },
    ]);
    expect(reply).toContain("A que horas?");
    expect(reply).not.toContain("tentar outra vez");
  });

  it("G5 — falha de outra natureza explica-se sem 'tenta outra vez'", () => {
    const reply = explainToolFailure([
      { name: "reschedule_reminder", ok: false, error: "reminder_not_found" },
    ]);
    expect(reply).toContain("Não encontrei");
    expect(explainToolFailure([{ name: "x", ok: true }])).toBeNull();
  });
});

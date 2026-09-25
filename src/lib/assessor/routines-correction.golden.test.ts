// Golden — correções a rotinas executam de facto; ocorrências não ficam presas.
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { materializeDueRoutinesServer, type RoutineRow } from "./routines-run.server";
import { isFollowUpOpen } from "@/lib/follow-ups/state";
import { enforceTransparentConfirmation, NOT_SAVED_REPLY } from "./v3/write-receipt";
import { DECIDE_SYSTEM_PROMPT } from "./v3/prompts";

const USER = "7a517907-2473-47ec-97b7-d4289fbe1b7b";
const RID = "rot-leadgen";

const weekly = (over: Partial<RoutineRow> = {}): RoutineRow => ({
  id: RID, user_id: USER, title: "Lead gen com a equipa na Zome", notes: null,
  frequency: "weekly", interval_n: 1, weekday: 4, day_of_month: null, time_of_day: "15:00",
  next_run_at: "2026-10-01T15:00:00.000Z", person_id: null, opportunity_id: null,
  priority: "Média", kind: "follow_up", digest_query: null, active: true, ...over,
} as RoutineRow);

const occ = (day: string) => ({
  id: `fu-${day}`, user_id: USER, type: "tarefa", title: "Lead gen com a equipa na Zome",
  status: "pendente", outcome: null, archived_at: null, due_date: `${day}T15:00:00.000Z`,
  due_time: "15:00", external_reference: `routine:${RID}:${day}`,
});

describe("G1. correção de rotina → update_routine executado antes de confirmar", () => {
  it("prompt obriga a chamar update_routine", () => {
    expect(DECIDE_SYSTEM_PROMPT).toMatch(/CORREÇÕES A ROTINAS/);
    expect(DECIDE_SYSTEM_PROMPT).toMatch(/update_routine/);
  });
  it("com update_routine bem-sucedido a confirmação sai", () => {
    const reply = "Fica anotado: a Lead Gen passa a ser às quintas às 15:00.";
    const out = enforceTransparentConfirmation(reply, [{ name: "update_routine", ok: true, data: { routine: { id: RID } } }], { executedOk: true });
    expect(out).toBe(reply);
  });
});

describe("G2. falha/ausência de escrita → diz que não guardou", () => {
  it("caso real 19/09: 'Fica anotado' sem ferramenta", () => {
    const out = enforceTransparentConfirmation("Bom dia, *Iolanda*. Fica anotado que a Lead Gen é só às quintas-feiras.", [], { executedOk: false });
    expect(out).toBe(NOT_SAVED_REPLY);
    expect(out).not.toMatch(/fica anotado/i);
  });
  it("update_routine falhou", () => {
    const out = enforceTransparentConfirmation("Atualizei a rotina para quintas.", [{ name: "update_routine", ok: false }], { executedOk: false });
    expect(out).toMatch(/não consegui guardar/);
  });
});

describe("G3. ocorrência antiga por fechar é substituída", () => {
  it("ocorrência de há 3 semanas fecha e nasce a nova", async () => {
    const sb = makeFakeSupabase({ routines: [weekly()], follow_ups: [occ("2026-09-10")] });
    const res = await materializeDueRoutinesServer(sb as any, { now: new Date("2026-10-01T15:05:00.000Z") });
    expect(res.created).toBe(1);
    const open = (sb.state.follow_ups as any[]).filter((f) => isFollowUpOpen(f));
    expect(open).toHaveLength(1);
    expect(open[0].external_reference).toBe(`routine:${RID}:2026-10-01`);
  });
});

describe("G4. caso Iolanda: quinta-feira, antigas fechadas, sem repetir diariamente", () => {
  it("só dispara às quintas e sem arrastar as de 2/09 e 15/09", async () => {
    const sb = makeFakeSupabase({ routines: [weekly()], follow_ups: [occ("2026-09-02"), occ("2026-09-15")] });
    for (const d of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]) {
      const r = await materializeDueRoutinesServer(sb as any, { now: new Date(`${d}T15:05:00.000Z`) });
      expect(r.created).toBe(0);
    }
    await materializeDueRoutinesServer(sb as any, { now: new Date("2026-10-01T15:05:00.000Z") });
    const open = (sb.state.follow_ups as any[]).filter((f) => isFollowUpOpen(f));
    expect(open).toHaveLength(1);
    expect(new Date(open[0].due_date).getUTCDay()).toBe(4);
    expect(sb.state.routines[0].next_run_at).toBe("2026-10-08T15:00:00.000Z");
  });
});

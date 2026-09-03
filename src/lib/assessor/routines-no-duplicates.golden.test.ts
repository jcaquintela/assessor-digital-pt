// Golden tests — uma rotina nunca acumula ocorrências por fechar.
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { materializeDueRoutinesServer, nextRunAfter, type RoutineRow } from "./routines-run.server";
import { isFollowUpOpen } from "@/lib/follow-ups/state";

const USER = "df098797-b532-40bb-a298-003ef99fe81a";
const RID = "1903df4f-dd3e-4388-9d62-636bd2048ef5";

function routine(over: Record<string, any> = {}): RoutineRow {
  return {
    id: RID,
    user_id: USER,
    title: "Contactar placa 917 550 184",
    notes: null,
    frequency: "daily",
    interval_n: 1,
    weekday: null,
    day_of_month: null,
    time_of_day: "10:00",
    next_run_at: "2026-08-12T10:00:00.000Z",
    person_id: null,
    opportunity_id: null,
    priority: "Média",
    active: true,
    kind: "follow_up",
    digest_query: null,
    ...over,
  } as RoutineRow;
}

function occurrence(day: string, over: Record<string, any> = {}) {
  return {
    id: `fu-${day}`,
    user_id: USER,
    type: "tarefa",
    title: "Contactar placa 917 550 184",
    status: "pendente",
    outcome: null,
    archived_at: null,
    due_date: `${day}T10:00:00.000Z`,
    due_time: "10:00",
    external_reference: `routine:${RID}:${day}`,
    ...over,
  };
}

const openOnes = (sb: any) =>
  (sb.state.follow_ups as any[]).filter((f) => isFollowUpOpen(f));

describe("1. ocorrência anterior ainda pendente", () => {
  it("não cria nova ocorrência no dia seguinte", async () => {
    const sb = makeFakeSupabase({
      routines: [routine()],
      follow_ups: [occurrence("2026-08-11")],
    });
    const res = await materializeDueRoutinesServer(sb as any, {
      now: new Date("2026-08-12T10:05:00.000Z"),
    });
    expect(res.created).toBe(0);
    expect(res.skipped).toBe(1);
    expect(sb.state.follow_ups).toHaveLength(1);
  });
});

describe("2. ocorrência anterior concluída", () => {
  it("cria a ocorrência seguinte normalmente", async () => {
    const sb = makeFakeSupabase({
      routines: [routine()],
      follow_ups: [occurrence("2026-08-11", { status: "Concluído" })],
    });
    const res = await materializeDueRoutinesServer(sb as any, {
      now: new Date("2026-08-12T10:05:00.000Z"),
    });
    expect(res.created).toBe(1);
    expect(sb.state.follow_ups).toHaveLength(2);
    expect(openOnes(sb)).toHaveLength(1);
    // E a rotina avançou para o dia seguinte.
    expect(sb.state.routines[0].next_run_at).toBe(
      nextRunAfter(routine(), new Date("2026-08-12T10:05:00.000Z")).toISOString(),
    );
  });
});

describe("3. caso real do Pedro Cunha", () => {
  it("3 dias consecutivos sem conclusão → 1 ocorrência, não 3", async () => {
    const sb = makeFakeSupabase({ routines: [routine({ next_run_at: "2026-08-11T10:00:00.000Z" })], follow_ups: [] });
    for (const dia of ["2026-08-11", "2026-08-12", "2026-08-13"]) {
      await materializeDueRoutinesServer(sb as any, { now: new Date(`${dia}T10:05:00.000Z`) });
    }
    expect(sb.state.follow_ups).toHaveLength(1);
    expect(openOnes(sb)).toHaveLength(1);
    expect(sb.state.follow_ups[0].external_reference).toBe(`routine:${RID}:2026-08-11`);
  });
});

describe("4. limpeza da conta: consolidar na mais antiga", () => {
  it("19 pendentes → 1 ativa e 18 arquivadas, sem perder histórico", async () => {
    const dias = Array.from({ length: 19 }, (_, i) =>
      `2026-08-${String(11 + i).padStart(2, "0")}`,
    );
    const sb = makeFakeSupabase({ routines: [], follow_ups: dias.map((d) => occurrence(d)) });

    // Mesma regra da limpeza real: fica a mais antiga, as outras ficam
    // arquivadas com nota — continuam no histórico.
    const rows = [...(sb.state.follow_ups as any[])].sort((a, b) =>
      a.external_reference < b.external_reference ? -1 : 1,
    );
    for (const dup of rows.slice(1)) {
      dup.archived_at = "2026-09-03T15:00:00.000Z";
      dup.status = "Arquivado";
      dup.notes = "[Rotina] Duplicado, consolidado no seguimento de 11/08.";
    }

    expect(sb.state.follow_ups).toHaveLength(19);
    expect(openOnes(sb)).toHaveLength(1);
    expect(openOnes(sb)[0].external_reference).toBe(`routine:${RID}:2026-08-11`);
    const arquivados = (sb.state.follow_ups as any[]).filter((f) => f.archived_at);
    expect(arquivados).toHaveLength(18);
    expect(arquivados.every((f) => String(f.notes).includes("consolidado"))).toBe(true);
  });
});

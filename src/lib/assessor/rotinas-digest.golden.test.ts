// Golden tests — Rotinas por conversa: tipo "digest" + list/update/delete.
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { materializeDueRoutinesServer } from "./routines-run.server";
import { buildDigestText } from "./routines-digest.server";
import { classifyDigestQuery } from "./routines-digest";
import { isClientMaterializable } from "@/lib/routines";
import { dispatchToolCall } from "./v2/domain.server";

const USER = "11111111-1111-4111-8111-111111111111";
const ctx = (supabase: any) => ({ supabase, userId: USER } as any);
const runDomainTool = (c: any, name: string, args: unknown) =>
  dispatchToolCall(c, name, JSON.stringify(args));

function routine(over: Record<string, any> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: USER,
    title: "Leads sem resposta",
    notes: null,
    frequency: "daily",
    interval_n: 1,
    weekday: null,
    day_of_month: null,
    time_of_day: "18:00",
    next_run_at: "2026-09-01T17:00:00.000Z",
    person_id: null,
    opportunity_id: null,
    priority: "Média",
    kind: "digest",
    digest_query: "leads sem resposta",
    active: true,
    ...over,
  };
}

describe("golden — rotinas digest", () => {
  it("1. 'resume-me os leads sem resposta às 18h' cria digest e envia resumo real", async () => {
    const supabase = makeFakeSupabase({
      prospecting_leads: [
        { id: "l1", user_id: USER, title: "Rua das Flores 12", status: "contact_attempted", archived_at: null },
        { id: "l2", user_id: USER, title: "Av. Central 3", status: "to_contact", archived_at: null },
      ],
      routines: [],
      assessor_nudges: [],
    });

    const created = await runDomainTool(ctx(supabase), "create_routine", {
      title: "Leads sem resposta",
      frequency: "daily",
      time_of_day: "18:00",
      kind: "digest",
      digest_query: "leads sem resposta",
    });
    expect(created.ok).toBe(true);
    const row = (created as any).data.routine;
    expect(row.kind).toBe("digest");

    // Disparo: a leitura é feita no momento e o texto sai com dados reais.
    const text = await buildDigestText(supabase, USER, { query: "leads sem resposta", title: "Leads sem resposta" });
    expect(text).toContain("Rua das Flores 12 (sem resposta)");
    expect(text).toContain("Av. Central 3 (por contactar)");
    expect(classifyDigestQuery("leads sem resposta")).toBe("leads");
  });

  it("2. list_routines devolve as rotinas activas de forma legível", async () => {
    const supabase = makeFakeSupabase({ routines: [routine(), routine({ id: "r2", title: "Off", active: false })] });
    const res = await runDomainTool(ctx(supabase), "list_routines", {});
    expect(res.ok).toBe(true);
    const list = (res as any).data.routines;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Leads sem resposta", kind: "digest", time_of_day: "18:00" });
  });

  it("3. update_routine altera hora/frequência sem duplicar", async () => {
    const supabase = makeFakeSupabase({ routines: [routine()] });
    const res = await runDomainTool(ctx(supabase), "update_routine", {
      routine_id: routine().id,
      time_of_day: "19:30",
      frequency: "weekly",
      weekday: 1,
    });
    expect(res.ok).toBe(true);
    const after = await runDomainTool(ctx(supabase), "list_routines", {});
    const list = (after as any).data.routines;
    expect(list).toHaveLength(1);
    expect(list[0].time_of_day).toBe("19:30");
    expect(list[0].frequency).toBe("weekly");
  });

  it("4. delete_routine remove definitivamente e não volta a disparar", async () => {
    const supabase = makeFakeSupabase({ routines: [routine()], assessor_nudges: [] });
    const res = await runDomainTool(ctx(supabase), "delete_routine", { routine_id: routine().id });
    expect(res.ok).toBe(true);
    const out = await materializeDueRoutinesServer(supabase, { now: new Date("2026-09-01T18:00:00.000Z") });
    expect(out.digests).toBe(0);
  });

  it("5. rotina follow_up continua a materializar seguimento (sem regressão)", async () => {
    const supabase = makeFakeSupabase({
      routines: [routine({ kind: "follow_up", digest_query: null, title: "Rever pipeline" })],
      follow_ups: [],
    });
    const out = await materializeDueRoutinesServer(supabase, { now: new Date("2026-09-01T18:00:00.000Z") });
    expect(out.created).toBe(1);
    expect(out.digests).toBe(0);
  });

  it("6. digest não corre pelo caminho do cliente e dispara no servidor", async () => {
    expect(isClientMaterializable({ kind: "digest" } as any)).toBe(false);
    expect(isClientMaterializable({ kind: "follow_up" } as any)).toBe(true);

    const supabase = makeFakeSupabase({
      routines: [routine()],
      prospecting_leads: [{ id: "l1", user_id: USER, title: "Rua A", status: "contact_attempted", archived_at: null }],
      assessor_nudges: [],
      follow_ups: [],
    });
    const out = await materializeDueRoutinesServer(supabase, { now: new Date("2026-09-01T18:00:00.000Z") });
    expect(out.digests).toBe(1);
    expect(out.created).toBe(0);
    const nudges = await supabase.from("assessor_nudges").select("*").eq("user_id", USER);
    expect(nudges.data).toHaveLength(1);
    expect(nudges.data[0].suggested_reply).toContain("Rua A");
    expect(nudges.data[0].kind).toBe("routine_digest");
  });
});

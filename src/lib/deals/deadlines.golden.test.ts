// Golden tests — Prazos de negócio (datas com consequência).
// O que se protege aqui: a escada de aviso, a resolução do negócio certo,
// o silêncio face a esclarecimentos, e o fecho automático sem insistência.
import { describe, expect, it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import {
  DEFAULT_NOTICE_DAYS, daysUntilDeadline, isInNoticeWindow, parseNoticeDays,
} from "./deadlines";
import {
  closeStaleDeadlines, deadlinesInNoticeWindow, generateDeadlineNudges, listDeadlines,
} from "./deadlines.server";
import { applyDeadlineDateCorrection, execAddDealDeadline } from "./deadline-tools.server";

const U = "user-1";

function ymd(offsetDays: number, base = new Date("2026-09-10T09:00:00Z")): string {
  const d = new Date(base.getTime() + offsetDays * 864e5);
  return d.toISOString().slice(0, 10);
}
const NOW = new Date("2026-09-10T09:00:00Z");

function deal(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: U, title, stage: "cpcv", status: "aberta", archived_at: null,
    updated_at: "2026-09-01T10:00:00Z", person_id: null, ...extra,
  };
}
function deadline(id: string, opportunity_id: string, dueOffset: number, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: U, opportunity_id, label: "Escritura", due_date: ymd(dueOffset),
    status: "aberto", archived_at: null, notice_days: null, notes: null, ...extra,
  };
}

describe("prazos de negócio — golden", () => {
  it("1) fluxo feliz: regista o prazo no negócio único e passa a avisar", async () => {
    const sb = makeFakeSupabase({
      opportunities: [deal("d1", "Venda Rua das Flores")],
      deal_deadlines: [],
    });
    const r = await execAddDealDeadline(
      { supabase: sb, userId: U },
      { label: "Escritura", due_date: ymd(3), deal_hint: "escritura da Rua das Flores" },
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).opportunity_id).toBe("d1");

    const alerts = await deadlinesInNoticeWindow(sb, U, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.days_left).toBe(3);
    expect(alerts[0]!.when).toBe("faltam 3 dias");
  });

  it("2) ambiguidade: dois negócios possíveis não escrevem nada, perguntam", async () => {
    const sb = makeFakeSupabase({
      opportunities: [deal("d1", "Venda Rua A"), deal("d2", "Venda Rua B")],
      deal_deadlines: [],
    });
    const r = await execAddDealDeadline(
      { supabase: sb, userId: U },
      { label: "Financiamento", due_date: ymd(5) },
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).needs_resolution).toBe(true);
    expect((r.data as any).resolution.status).toBe("choose");
    expect(String((r.data as any).question)).toMatch(/negócio/i);
    expect(await listDeadlines(sb, U)).toHaveLength(0);
  });

  it("3) escada de antecipação: avisa a 7, 3, 1 e 0 dias — e não nos dias do meio", () => {
    expect([7, 3, 1, 0].every((d) => isInNoticeWindow(d))).toBe(true);
    expect([6, 5, 4, 2].some((d) => isInNoticeWindow(d))).toBe(false);
    expect(isInNoticeWindow(8)).toBe(false);
    expect(isInNoticeWindow(-1)).toBe(true); // já passou: escala todos os dias
    expect(isInNoticeWindow(14, 14)).toBe(true); // antecedência pedida pelo consultor
    expect(parseNoticeDays("avisa-me com duas semanas de antecedência")).toBe(14);
    expect(parseNoticeDays("escritura dia 15")).toBeNull();
    expect(DEFAULT_NOTICE_DAYS).toBe(7);
  });

  it("4) esclarecimento não muda a data: só depois de confirmação explícita", async () => {
    const sb = makeFakeSupabase({
      opportunities: [deal("d1", "Venda Rua A")],
      deal_deadlines: [deadline("p1", "d1", 10)],
    });
    const ctx = { supabase: sb, userId: U };
    const soft = await applyDeadlineDateCorrection(ctx, {
      deadlineId: "p1", newDate: ymd(20), utterance: "a escritura afinal é dia 20",
    });
    expect(soft.written).toBe(false);
    expect(soft.question).toMatch(/confirmares/i);
    expect((await listDeadlines(sb, U))[0]!.due_date).toBe(ymd(10));

    const hard = await applyDeadlineDateCorrection(ctx, {
      deadlineId: "p1", newDate: ymd(20), utterance: "sim", confirmed: true,
    });
    expect(hard.written).toBe(true);
    expect((await listDeadlines(sb, U))[0]!.due_date).toBe(ymd(20));
  });

  it("5) negócio fechado não gera prazos e prazo cumprido sai da lista", async () => {
    const sb = makeFakeSupabase({
      opportunities: [deal("d1", "Venda concluída", { stage: "concluido" }), deal("d2", "Venda viva")],
      deal_deadlines: [
        deadline("p1", "d1", 1),
        deadline("p2", "d2", 1, { status: "cumprido" }),
        deadline("p3", "d2", 0),
      ],
    });
    const alerts = await deadlinesInNoticeWindow(sb, U, NOW);
    expect(alerts.map((a) => a.id)).toEqual(["p3"]);
    expect(alerts[0]!.when).toBe("é hoje");
  });

  it("6) fecho automático: prazo esquecido há 7 dias cai em Diversos e deixa de insistir", async () => {
    const sb = makeFakeSupabase({
      opportunities: [deal("d1", "Venda Rua A")],
      deal_deadlines: [deadline("p1", "d1", -8)],
      miscellaneous_items: [],
    });
    expect(await deadlinesInNoticeWindow(sb, U, NOW)).toHaveLength(0);
    expect(await closeStaleDeadlines(sb, U, NOW)).toBe(1);

    const misc = await sb.from("miscellaneous_items").select("*").eq("user_id", U);
    expect(misc.data).toHaveLength(1);
    expect(misc.data[0].category).toBe("Por tratar");
    expect(await listDeadlines(sb, U, { includeClosed: true })).toHaveLength(0);
    // Segunda passagem não duplica nem volta a fechar.
    expect(await closeStaleDeadlines(sb, U, NOW)).toBe(0);
  });

  it("7) avisos: teto respeitado, mais urgente primeiro e chave estável por dia", async () => {
    const sb = makeFakeSupabase({
      opportunities: [deal("d1", "Venda Rua A")],
      deal_deadlines: [
        deadline("p1", "d1", 7, { label: "Financiamento" }),
        deadline("p2", "d1", 0, { label: "Escritura" }),
        deadline("p3", "d1", -1, { label: "Vistoria" }),
      ],
    });
    const n = await generateDeadlineNudges(sb, U, { max: 2, now: NOW });
    expect(n).toHaveLength(2);
    expect(n.map((x) => x.subject_id)).toEqual(["p3", "p2"]);
    expect(n[0]!.kind).toBe("deal_deadline");
    expect(n[0]!.dedupe_key).toBe("deal_deadline:p3:20260910");
    const again = await generateDeadlineNudges(sb, U, { max: 2, now: NOW });
    expect(again.map((x) => x.dedupe_key)).toEqual(n.map((x) => x.dedupe_key));
    expect(daysUntilDeadline(ymd(-1), ymd(0))).toBe(-1);
  });
});

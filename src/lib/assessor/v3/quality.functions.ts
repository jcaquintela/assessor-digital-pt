import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as any[]) ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const getQualityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();

    const { data: rows } = await supabaseAdmin
      .from("assessor_quality_scores")
      .select("created_at, understood_first_try, reformulated, executed_successfully, human_tone, score")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    const all = ((rows as any[]) ?? []);

    // AQS diário (14 dias).
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const r of all) {
      const d = String(r.created_at).slice(0, 10);
      const b = byDay.get(d) ?? { sum: 0, n: 0 };
      if (typeof r.score === "number") { b.sum += r.score; b.n += 1; }
      byDay.set(d, b);
    }
    const daily = [...byDay.entries()]
      .map(([day, v]) => ({ day, avg: v.n ? Number((v.sum / v.n).toFixed(3)) : null, n: v.n }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const total = all.length;
    const dist = {
      understood_first_try: all.filter((r) => r.understood_first_try).length,
      reformulated: all.filter((r) => r.reformulated).length,
      executed_successfully: all.filter((r) => r.executed_successfully).length,
      human_tone: all.filter((r) => r.human_tone).length,
    };

    const { data: lowRows } = await supabaseAdmin
      .from("assessor_quality_scores")
      .select("id, user_id, channel, score, created_at, trace_id, understood_first_try, reformulated, executed_successfully, human_tone")
      .lt("score", 0.75)
      .order("created_at", { ascending: false })
      .limit(20);

    return { total, daily, dist, low: (lowRows as any[]) ?? [] };
  });

// Trust Mode v1 — ATS + Top failures + Últimas correções + Definição de Pronto.
export const getTrustOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();

    const [{ data: trustRows }, { data: correctionRows }] = await Promise.all([
      supabaseAdmin
        .from("assistant_trust_scores")
        .select("created_at, ats, task_success, aqs_score, corrections_count, context_preservation, safe_decisions, trace_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from("assistant_user_corrections")
        .select("id, created_at, category, original_message, correction_message, resolved, turn_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const trust = ((trustRows as any[]) ?? []);
    const corrections = ((correctionRows as any[]) ?? []);

    // ATS diário.
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const r of trust) {
      if (typeof r.ats !== "number") continue;
      const d = String(r.created_at).slice(0, 10);
      const b = byDay.get(d) ?? { sum: 0, n: 0 };
      b.sum += r.ats; b.n += 1;
      byDay.set(d, b);
    }
    const daily = [...byDay.entries()]
      .map(([day, v]) => ({ day, ats: v.n ? Number((v.sum / v.n).toFixed(1)) : null, n: v.n }))
      .sort((a, b) => a.day.localeCompare(b.day));

    // Breakdown por pilar (média).
    const avg = (key: string) => {
      const vals = trust.map((r: any) => r[key]).filter((v: any) => typeof v === "number");
      if (!vals.length) return null;
      return Number((vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(3));
    };
    const pillars = {
      task_success: avg("task_success"),
      aqs: avg("aqs_score"),
      context_preservation: avg("context_preservation"),
      safe_decisions: avg("safe_decisions"),
      ats: avg("ats"),
      corrections_rate: trust.length ? Number((corrections.length / trust.length).toFixed(3)) : null,
    };

    // Top 10 falhas: agrega categorias de correções + heurísticas do trust.
    const failureBuckets = new Map<string, number>();
    const bump = (k: string, n = 1) => failureBuckets.set(k, (failureBuckets.get(k) ?? 0) + n);
    for (const c of corrections) {
      const label: Record<string, string> = {
        wrong_person: "Pessoa errada",
        wrong_property: "Imóvel errado",
        wrong_date: "Data errada",
        wrong_document: "Documento errado",
        lost_context: "Contexto perdido",
        unnatural_reply: "Resposta pouco natural",
        unnecessary_question: "Pergunta desnecessária",
        wrong_execution: "Execução errada",
        other: "Outro",
      };
      bump(label[c.category] ?? "Outro");
    }
    for (const r of trust) {
      if (typeof r.context_preservation === "number" && r.context_preservation < 0.5) bump("Perdeu contexto");
      if (typeof r.safe_decisions === "number" && r.safe_decisions < 0.5) bump("Confirmou antes de executar");
      if (r.task_success === 0) bump("Execução falhou");
    }
    const totalFailures = [...failureBuckets.values()].reduce((a, b) => a + b, 0);
    const topFailures = [...failureBuckets.entries()]
      .map(([label, count]) => ({ label, count, pct: totalFailures ? Math.round((count / totalFailures) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Definição de Pronto.
    const readiness = {
      ats_ok: pillars.ats != null && pillars.ats >= 90,
      aqs_ok: pillars.aqs != null && pillars.aqs >= 0.9,
      task_success_ok: pillars.task_success != null && pillars.task_success >= 0.95,
      corrections_ok: pillars.corrections_rate != null && pillars.corrections_rate < 0.03,
      context_ok: pillars.context_preservation != null && pillars.context_preservation > 0.98,
    };

    return {
      total: trust.length,
      daily,
      pillars,
      topFailures,
      corrections,
      readiness,
    };
  });
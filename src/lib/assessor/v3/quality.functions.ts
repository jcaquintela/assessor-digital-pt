import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

// Transcrição real de um turno: a prova ao lado da pontuação.
// Sem isto, um AQS baixo é só um número — com isto vê-se a mensagem do
// consultor, a resposta do Assessor, as ferramentas e o erro real.
export const getTurnTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ traceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trace } = await supabaseAdmin
      .from("assessor_reasoning_traces")
      .select(
        "id, created_at, user_id, channel, input_content, reply, decision, tool_calls, error, success, total_latency_ms",
      )
      .eq("id", data.traceId)
      .maybeSingle();

    if (!trace) return { found: false as const, traceId: data.traceId };

    const t = trace as any;
    const from = new Date(new Date(t.created_at).getTime() - 15 * 60_000).toISOString();
    const to = new Date(new Date(t.created_at).getTime() + 5 * 60_000).toISOString();

    const [{ data: msgs }, { data: corrections }] = await Promise.all([
      supabaseAdmin
        .from("assessor_messages")
        .select("id, role, content, created_at, channel")
        .eq("user_id", t.user_id)
        .eq("channel", t.channel)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: true })
        .limit(40),
      supabaseAdmin
        .from("assistant_user_corrections")
        .select("id, created_at, category, correction_message")
        .eq("turn_id", data.traceId)
        .order("created_at", { ascending: true }),
    ]);

    const toolCalls = Array.isArray(t.tool_calls) ? t.tool_calls : [];

    // Conteúdo real só com consentimento vivo (ou conta de teste / programa
    // de avaliação). Sem isso devolvemos a mesma análise, sem as palavras.
    const { canOpenRealContent, auditContentAccess } = await import("@/lib/admin/consent.server");
    const access = await canOpenRealContent(supabaseAdmin, {
      targetUserId: t.user_id,
      adminId: context.userId,
      resourceId: t.id,
    });
    if (access.allowed) {
      await auditContentAccess(supabaseAdmin, {
        adminId: context.userId,
        targetUserId: t.user_id,
        resourceId: t.id,
        basis: access.basis ?? "consent",
        consentId: access.consentId,
        reason: "Abertura de conversa em Qualidade",
      });
    }
    const hide = (v: string | null) => (access.allowed ? v : v == null ? null : "•".repeat(Math.min(24, v.length)));

    return {
      found: true as const,
      traceId: t.id,
      targetUserId: t.user_id as string,
      contentVisible: access.allowed,
      contentBasis: access.basis,
      contentExpiresAt: access.expiresAt,
      createdAt: t.created_at as string,
      channel: t.channel as string,
      userMessage: hide(t.input_content as string) as string,
      reply: hide((t.reply as string) ?? null),
      action: (t.decision as any)?.action ?? null,
      confidence: (t.decision as any)?.confidence ?? null,
      error: (t.error as string) ?? null,
      success: !!t.success,
      latencyMs: t.total_latency_ms as number | null,
      tools: toolCalls.map((c: any) => ({
        name: c?.name ?? "—",
        ok: c?.ok !== false,
        error: c?.error ?? null,
      })),
      messages: (access.allowed ? ((msgs as any[]) ?? []) : []).map((m) => ({
        id: m.id,
        role: m.role as string,
        content: m.content as string,
        createdAt: m.created_at as string,
      })),
      messageCount: ((msgs as any[]) ?? []).length,
      corrections: ((corrections as any[]) ?? []).map((c) => ({
        id: c.id,
        createdAt: c.created_at as string,
        category: c.category as string,
        message: (hide(c.correction_message as string) ?? "") as string,
      })),
    };
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
// Comparativo de tendência da reformulação (critério antigo vs novo),
// mesmos filtros e mesma janela de 14 dias do resto de Qualidade.
export const getReformulationTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeReformulationTrend } = await import("./reformulation-trend.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();

    const { data } = await supabaseAdmin
      .from("assessor_quality_scores")
      .select("created_at, user_id, channel, reformulated")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    return computeReformulationTrend(((data as any[]) ?? []) as any);
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runGolden, type GoldenTurn } from "./golden.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as any[]) ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const listGoldens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: goldens } = await supabaseAdmin
      .from("assistant_golden_conversations")
      .select("id, slug, title, description, turns, tags, active, updated_at")
      .order("slug", { ascending: true });
    const { data: runs } = await supabaseAdmin
      .from("assistant_golden_runs")
      .select("id, golden_id, release_ref, passed, diffs, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    const latestByGolden = new Map<string, any>();
    for (const r of ((runs as any[]) ?? [])) {
      if (!latestByGolden.has(r.golden_id)) latestByGolden.set(r.golden_id, r);
    }
    return {
      goldens: ((goldens as any[]) ?? []).map((g) => ({
        ...g,
        latest_run: latestByGolden.get(g.id) ?? null,
      })),
      recentRuns: ((runs as any[]) ?? []).slice(0, 20),
    };
  });

export const runGoldenSuite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as { releaseRef?: string; goldenId?: string };
    return {
      releaseRef: String(o.releaseRef ?? new Date().toISOString().slice(0, 19)),
      goldenId: o.goldenId ? String(o.goldenId) : null,
    };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("assistant_golden_conversations")
      .select("id, slug, title, turns")
      .eq("active", true);
    if (data.goldenId) query = query.eq("id", data.goldenId);
    const { data: goldens } = await query;

    const summaries: Array<{
      id: string; slug: string; passed: boolean; failures: number;
      inconclusive?: boolean; unavailableReason?: string | null;
    }> = [];
    for (const g of ((goldens as any[]) ?? [])) {
      const turns = (g.turns as GoldenTurn[]) ?? [];
      let result;
      try {
        result = await runGolden(turns);
      } catch (err) {
        result = { passed: false, turns: [{ turn: 0, user: "", reply: "", action: "error", tools: [], passed: false, failures: [String(err instanceof Error ? err.message : err)] }], aqsAvg: null };
      }
      const failureCount = result.turns.reduce((a, t) => a + (t.passed ? 0 : 1), 0);
      await supabaseAdmin.from("assistant_golden_runs").insert({
        golden_id: g.id,
        release_ref: data.releaseRef,
        passed: result.passed,
        ats: null,
        aqs: null,
        task_success: null,
        diffs: {
          turns: result.turns,
          inconclusive: (result as any).inconclusive === true,
          unavailable_reason: (result as any).unavailableReason ?? null,
        } as unknown,
      } as never);
      summaries.push({
        id: g.id, slug: g.slug, passed: result.passed, failures: failureCount,
        inconclusive: (result as any).inconclusive === true,
        unavailableReason: (result as any).unavailableReason ?? null,
      });
    }
    const inconclusive = summaries.filter((s) => s.inconclusive).length;
    return { releaseRef: data.releaseRef, total: summaries.length, inconclusive, summaries };
  });

export const getGoldenRunDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ({ goldenId: String((v as any)?.goldenId ?? "") }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    if (!data.goldenId) return { runs: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: runs } = await supabaseAdmin
      .from("assistant_golden_runs")
      .select("id, release_ref, passed, diffs, created_at")
      .eq("golden_id", data.goldenId)
      .order("created_at", { ascending: false })
      .limit(10);
    return { runs: (runs as any[]) ?? [] };
  });

export const getShadowOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("assistant_shadow_runs")
      .select("id, strategy, reply, diff, latency_ms, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    const all = (rows as any[]) ?? [];
    const byStrategy = new Map<string, { n: number; sameAction: number; sameReply: number }>();
    for (const r of all) {
      const s = String(r.strategy);
      const b = byStrategy.get(s) ?? { n: 0, sameAction: 0, sameReply: 0 };
      b.n += 1;
      if (r.diff?.same_action) b.sameAction += 1;
      if (r.diff?.same_reply) b.sameReply += 1;
      byStrategy.set(s, b);
    }
    const strategies = [...byStrategy.entries()].map(([strategy, v]) => ({
      strategy, n: v.n,
      same_action_pct: v.n ? Math.round((v.sameAction / v.n) * 100) : 0,
      same_reply_pct: v.n ? Math.round((v.sameReply / v.n) * 100) : 0,
    }));
    return { total: all.length, strategies, recent: all.slice(0, 20) };
  });
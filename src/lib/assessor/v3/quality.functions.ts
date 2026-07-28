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
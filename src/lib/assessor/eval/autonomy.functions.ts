// Métricas de autonomia comercial para a administração (só leitura).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAutonomyMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as { days?: number; scope?: string };
    const days = Math.min(90, Math.max(1, Math.round(Number(o.days ?? 30)) || 30));
    return { days, scope: o.scope === "all" ? "all" : "beta" } as const;
  })
  .handler(async ({ context, data }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const r = ((roles as any[]) ?? []).map((x) => x.role);
    if (!r.includes("super_admin") && !r.includes("support_admin")) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAutonomyMetrics } = await import("./autonomy-metrics.server");
    let q = supabaseAdmin.from("profiles").select("id");
    if (data.scope === "beta") q = q.eq("is_beta_tester", true);
    const { data: profiles } = await q.limit(5000);
    const userIds = ((profiles as any[]) ?? []).map((p) => p.id as string);
    const sinceIso = new Date(Date.now() - data.days * 86400_000).toISOString();
    const metrics = await loadAutonomyMetrics(supabaseAdmin, { sinceIso, userIds });
    return { days: data.days, scope: data.scope, accounts: userIds.length, metrics };
  });

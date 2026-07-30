import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as any[]) ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

// Uma confirmação curta ("sim", "ok") significa que o motor PEDIU confirmação
// antes de executar — logo não é uma ação autónoma.
const CONFIRMATION_RE =
  /^\s*(sim|ok(ay|ei)?|claro|pode ser|est[áa] bem|confirma(r|do)?|faz isso|regista(r)?|com certeza|👍|✅)\s*[.!]?\s*$/i;

export type AutonomousAction = {
  traceId: string;
  createdAt: string;
  userId: string;
  consultant: string;
  autonomyLevel: string;
  channel: string;
  request: string;
  tools: string[];
  ok: boolean;
  error: string | null;
  outcome: "mantida" | "corrigida";
  correctionCategory: string | null;
  correctionMessage: string | null;
};

// Feed de ações executadas SEM pedir confirmação, por consultor.
// Fonte: assessor_reasoning_traces (decisão + ferramentas executadas),
// cruzado com assistant_user_corrections (turn_id = trace) para saber se o
// consultor manteve ou corrigiu a seguir.
export const listAutonomousActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 864e5).toISOString();

    const { data: traceRows } = await supabaseAdmin
      .from("assessor_reasoning_traces")
      .select("id, created_at, user_id, channel, input_content, decision, tool_calls, error")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(400);

    const traces = ((traceRows as any[]) ?? []).filter((t) => {
      const action = (t.decision as any)?.action;
      const tools = Array.isArray(t.tool_calls) ? t.tool_calls : [];
      if (action !== "act" || tools.length === 0) return false;
      return !CONFIRMATION_RE.test(String(t.input_content ?? ""));
    });

    if (traces.length === 0) {
      return { items: [] as AutonomousAction[], total: 0, corrected: 0 };
    }

    const userIds = [...new Set(traces.map((t) => t.user_id).filter(Boolean))];
    const traceIds = traces.map((t) => t.id);

    const [{ data: profiles }, { data: prefs }, { data: corrections }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email").in("id", userIds),
      supabaseAdmin.from("consultant_preferences").select("user_id, autonomy_level").in("user_id", userIds),
      supabaseAdmin
        .from("assistant_user_corrections")
        .select("turn_id, category, correction_message, created_at")
        .in("turn_id", traceIds),
    ]);

    const profileById = new Map(((profiles as any[]) ?? []).map((p) => [p.id, p]));
    const autonomyById = new Map(((prefs as any[]) ?? []).map((p) => [p.user_id, p.autonomy_level]));
    const correctionByTrace = new Map(((corrections as any[]) ?? []).map((c) => [c.turn_id, c]));

    const items: AutonomousAction[] = traces.map((t) => {
      const tools = (Array.isArray(t.tool_calls) ? t.tool_calls : []) as any[];
      const correction = correctionByTrace.get(t.id) ?? null;
      const p = profileById.get(t.user_id);
      return {
        traceId: t.id,
        createdAt: t.created_at,
        userId: t.user_id,
        consultant: p?.name || p?.email || String(t.user_id ?? "").slice(0, 8),
        autonomyLevel: autonomyById.get(t.user_id) ?? "equilibrado",
        channel: t.channel,
        request: String(t.input_content ?? "").slice(0, 240),
        tools: tools.map((c) => c?.name ?? "—"),
        ok: tools.every((c) => c?.ok !== false) && !t.error,
        error: t.error ?? tools.find((c) => c?.ok === false)?.error ?? null,
        outcome: correction ? "corrigida" : "mantida",
        correctionCategory: correction?.category ?? null,
        correctionMessage: correction?.correction_message ?? null,
      };
    });

    return {
      items: items.slice(0, 100),
      total: items.length,
      corrected: items.filter((i) => i.outcome === "corrigida").length,
    };
  });

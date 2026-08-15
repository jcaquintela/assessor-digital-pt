import type { MentorDecision, MentorDecisionKind } from "./mentor-decisions";

/** Últimas decisões do consultor (janela larga o suficiente para o "cancelar"). */
export async function loadMentorDecisions(supabase: any, userId: string): Promise<MentorDecision[]> {
  const desde = new Date(Date.now() - 200 * 864e5).toISOString();
  const { data } = await supabase
    .from("mentor_decisions")
    .select("tip_key, decision, note, created_at")
    .eq("user_id", userId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((r: any) => ({
    tipKey: String(r.tip_key),
    decision: r.decision as MentorDecisionKind,
    note: r.note ?? null,
    createdAt: String(r.created_at),
  }));
}

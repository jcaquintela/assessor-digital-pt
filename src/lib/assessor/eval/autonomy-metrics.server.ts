// Leitura (só SELECT) dos dados para as métricas de autonomia comercial.
import { computeAutonomyMetrics, type AutonomyMetrics } from "./autonomy-metrics";

export async function loadAutonomyMetrics(admin: any, opts: { sinceIso: string; userIds: string[] }): Promise<AutonomyMetrics> {
  const ids = opts.userIds;
  const empty = { data: [] as any[] };
  if (!ids.length) {
    return computeAutonomyMetrics({ messages: [], toolLogs: [], pending: [], nudges: [], followUps: [], deals: [], aqsScores: [], corrections: 0, feedback: 0 });
  }
  const since = opts.sinceIso;
  const [msgs, logs, pend, nud, fu, deals, aqs, corr, fb] = await Promise.all([
    admin.from("assessor_messages").select("user_id, role, content, created_at").in("user_id", ids).gte("created_at", since).neq("channel", "dashboard").limit(20000),
    admin.from("assessor_ai_logs").select("user_id, created_at, tool_name, tool_success").in("user_id", ids).gte("created_at", since).not("tool_name", "is", null).limit(20000),
    admin.from("pending_actions").select("status").in("user_id", ids).gte("created_at", since).limit(20000),
    admin.from("assessor_nudges").select("status, outcome").in("user_id", ids).gte("created_at", since).limit(20000),
    admin.from("follow_ups").select("status, created_by_assessor").in("user_id", ids).gte("created_at", since).limit(20000),
    admin.from("opportunities").select("stage").in("user_id", ids).gte("created_at", since).limit(20000),
    admin.from("assessor_quality_scores").select("score").in("user_id", ids).gte("created_at", since).limit(20000),
    admin.from("assistant_user_corrections").select("id", { count: "exact", head: true }).in("user_id", ids).gte("created_at", since),
    admin.from("product_feedback").select("id", { count: "exact", head: true }).in("user_id", ids).gte("created_at", since),
  ]);
  return computeAutonomyMetrics({
    messages: (msgs ?? empty).data ?? [],
    toolLogs: (logs ?? empty).data ?? [],
    pending: (pend ?? empty).data ?? [],
    nudges: (nud ?? empty).data ?? [],
    followUps: (fu ?? empty).data ?? [],
    deals: (deals ?? empty).data ?? [],
    aqsScores: ((aqs ?? empty).data ?? []).map((r: any) => Number(r.score)),
    corrections: corr?.count ?? 0,
    feedback: fb?.count ?? 0,
  });
}

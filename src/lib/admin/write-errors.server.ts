// Erros de escrita do Afonso: falhas de ferramentas (assessor_tool_calls) e
// falhas do motor registadas em assessor_ai_logs. Serve o painel de admin
// "Erros de escrita" para diagnóstico rápido (ferramenta, erro, argumentos).

export type WriteErrorItem = {
  id: string;
  source: "tool" | "engine";
  created_at: string;
  channel: string | null;
  tool_name: string | null;
  error: string | null;
  intent: string | null;
  latency_ms: number | null;
  user_id: string | null;
  consultant: string | null;
  arguments: unknown;
  result: unknown;
};

function since(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export async function fetchWriteErrors(
  supabaseAdmin: any,
  opts: { hours?: number; limit?: number } = {},
): Promise<{ items: WriteErrorItem[]; last24h: number; hours: number }> {
  const hours = opts.hours ?? 24 * 7;
  const limit = opts.limit ?? 200;
  const from = since(hours);

  const [tools, logs] = await Promise.all([
    supabaseAdmin
      .from("assessor_tool_calls")
      .select("id, created_at, channel, tool_name, error, arguments, result, latency_ms, user_id")
      .eq("success", false)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("assessor_ai_logs")
      .select("id, created_at, channel, tool_name, error, intent, latency_ms, user_id, success, tool_success")
      .or("success.eq.false,tool_success.eq.false")
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const items: WriteErrorItem[] = [
    ...((tools.data ?? []) as any[]).map((r) => ({
      id: `tool:${r.id}`,
      source: "tool" as const,
      created_at: r.created_at,
      channel: r.channel ?? null,
      tool_name: r.tool_name ?? null,
      error: r.error ?? null,
      intent: null,
      latency_ms: r.latency_ms ?? null,
      user_id: r.user_id ?? null,
      consultant: null,
      arguments: r.arguments ?? null,
      result: r.result ?? null,
    })),
    ...((logs.data ?? []) as any[]).map((r) => ({
      id: `engine:${r.id}`,
      source: "engine" as const,
      created_at: r.created_at,
      channel: r.channel ?? null,
      tool_name: r.tool_name ?? null,
      error: r.error ?? null,
      intent: r.intent ?? null,
      latency_ms: r.latency_ms ?? null,
      user_id: r.user_id ?? null,
      consultant: null,
      arguments: null,
      result: null,
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const ids = [...new Set(items.map((i) => i.user_id).filter(Boolean))] as string[];
  if (ids.length) {
    const profiles = await supabaseAdmin.from("profiles").select("id, name, email").in("id", ids);
    const byId = new Map(((profiles.data ?? []) as any[]).map((p) => [p.id, p.name || p.email]));
    for (const i of items) if (i.user_id) i.consultant = byId.get(i.user_id) ?? null;
  }

  const cut = since(24);
  return { items: items.slice(0, limit), last24h: items.filter((i) => i.created_at >= cut).length, hours };
}

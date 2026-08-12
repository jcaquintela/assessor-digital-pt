// Erros de escrita do Afonso: falhas de ferramentas (assessor_tool_calls) e
// falhas do motor registadas em assessor_ai_logs. Serve o painel de admin
// "Erros de escrita" para diagnóstico rápido (ferramenta, erro, argumentos).

/**
 * Duas naturezas muito diferentes, que antes vinham somadas:
 * - "escrita": houve tentativa real de gravar dados e falhou (pode haver perda).
 * - "modelo": a 1.ª chamada ao modelo falhou/expirou e a resposta saiu pelo
 *   caminho de recurso (fallback). O consultor foi respondido; nada se perdeu.
 */
export type WriteErrorKind = "escrita" | "modelo";

export type WriteErrorItem = {
  id: string;
  source: "tool" | "engine";
  kind: WriteErrorKind;
  /** Só para falhas de modelo: a resposta saiu pelo caminho de recurso. */
  fallback_used: boolean;
  created_at: string;
  channel: string | null;
  tool_name: string | null;
  error: string | null;
  intent: string | null;
  latency_ms: number | null;
  user_id: string | null;
  consultant: string | null;
  arguments: string | null;
  /** Só falhas de ferramenta com argumentos guardados podem ser reexecutadas. */
  retryable: boolean;
  /** id cru da linha em assessor_tool_calls, para a reexecução. */
  raw_id: string | null;
  result: string | null;
};

function since(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export type WriteErrorsResult = {
  items: WriteErrorItem[];
  /** Só falhas de escrita — é o que justifica alarme. */
  last24h: number;
  /** Falhas de modelo com recurso nas últimas 24h (sinal de saúde, não alarme). */
  modelLast24h: number;
  /** Totais do período consultado, por categoria. */
  writeCount: number;
  modelCount: number;
  hours: number;
};

export async function fetchWriteErrors(
  supabaseAdmin: any,
  opts: { hours?: number; limit?: number } = {},
): Promise<WriteErrorsResult> {
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
      .select("id, created_at, channel, tool_name, error, intent, latency_ms, user_id, success, tool_success, fallback_used")
      .or("success.eq.false,tool_success.eq.false")
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const items: WriteErrorItem[] = [
    ...((tools.data ?? []) as any[]).map((r) => ({
      id: `tool:${r.id}`,
      source: "tool" as const,
      // Uma linha em assessor_tool_calls é sempre uma tentativa real de escrita.
      kind: "escrita" as const,
      fallback_used: false,
      created_at: r.created_at,
      channel: r.channel ?? null,
      tool_name: r.tool_name ?? null,
      error: r.error ?? null,
      intent: null,
      latency_ms: r.latency_ms ?? null,
      user_id: r.user_id ?? null,
      consultant: null,
      retryable: !!r.arguments && !!r.tool_name,
      raw_id: r.id,
      arguments: r.arguments ? JSON.stringify(r.arguments, null, 2) : null,
      result: r.result ? JSON.stringify(r.result, null, 2) : null,
    })),
    ...((logs.data ?? []) as any[]).map((r) => ({
      id: `engine:${r.id}`,
      source: "engine" as const,
      // Sem ferramenta e com recurso usado => o motor falhou, mas respondeu.
      kind: (r.fallback_used && !r.tool_name ? "modelo" : "escrita") as WriteErrorKind,
      fallback_used: !!r.fallback_used,
      created_at: r.created_at,
      channel: r.channel ?? null,
      tool_name: r.tool_name ?? null,
      error: r.error ?? null,
      intent: r.intent ?? null,
      latency_ms: r.latency_ms ?? null,
      user_id: r.user_id ?? null,
      consultant: null,
      retryable: false,
      raw_id: null,
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
  const shown = items.slice(0, limit);
  const recent = items.filter((i) => i.created_at >= cut);
  return {
    items: shown,
    last24h: recent.filter((i) => i.kind === "escrita").length,
    modelLast24h: recent.filter((i) => i.kind === "modelo").length,
    writeCount: shown.filter((i) => i.kind === "escrita").length,
    modelCount: shown.filter((i) => i.kind === "modelo").length,
    hours,
  };
}

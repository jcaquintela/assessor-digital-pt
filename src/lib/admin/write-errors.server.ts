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

/**
 * Tendência das falhas de modelo com recurso (fallback). Não há perda de dados,
 * mas é o melhor sinal de saúde do motor: se sobe, algo está a demorar demais.
 */
export async function fetchModelFallbackTrend(
  supabaseAdmin: any,
): Promise<{ d7: number; d30: number; prev7: number; lastAt: string | null; avgLatencyMs: number | null }> {
  const from30 = since(24 * 30);
  const { data } = await supabaseAdmin
    .from("assessor_ai_logs")
    .select("created_at, latency_ms, tool_name, fallback_used")
    .eq("success", false)
    .eq("fallback_used", true)
    .gte("created_at", from30)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = ((data ?? []) as any[]).filter((r) => !r.tool_name);
  const c7 = since(24 * 7);
  const c14 = since(24 * 14);
  const in7 = rows.filter((r) => r.created_at >= c7);
  const prev7 = rows.filter((r) => r.created_at < c7 && r.created_at >= c14).length;
  const lat = rows.map((r) => Number(r.latency_ms)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    d7: in7.length,
    d30: rows.length,
    prev7,
    lastAt: rows[0]?.created_at ?? null,
    avgLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
  };
}

/**
 * Alerta dedicado: ferramentas de atualização que falharam por não encontrarem
 * a entidade (id inventado pelo modelo). O consultor pediu uma alteração e
 * nada ficou gravado — é sempre perda de trabalho, mesmo sem exceção.
 */
export type NotFoundSample = {
  id: string;
  created_at: string;
  tool_name: string;
  error: string;
  entity: string | null;
  channel: string | null;
  user_id: string | null;
  consultant: string | null;
  /** Input que provocou a falha, truncado e com contactos mascarados. */
  input: Record<string, unknown> | null;
};

export type NotFoundStats = {
  last24h: number;
  last7d: number;
  prev7d: number;
  byTool: { tool: string; count: number }[];
  byEntity: { entity: string; count: number }[];
  samples: NotFoundSample[];
  lastAt: string | null;
};

export async function fetchNotFoundStats(
  supabaseAdmin: any,
  opts: { hours?: number; sampleLimit?: number } = {},
): Promise<NotFoundStats> {
  const { isEntityNotFound, notFoundEntity, inputSample } = await import("@/lib/assessor/v3/not-found");
  const hours = Math.max(opts.hours ?? 24 * 14, 24 * 14);
  const { data } = await supabaseAdmin
    .from("assessor_tool_calls")
    .select("id, created_at, channel, tool_name, error, arguments, user_id")
    .eq("success", false)
    .gte("created_at", since(hours))
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = ((data ?? []) as any[]).filter((r) => isEntityNotFound(r.error));
  const c24 = since(24);
  const c7 = since(24 * 7);
  const c14 = since(24 * 14);

  const tally = (key: (r: any) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const samples: NotFoundSample[] = rows.slice(0, opts.sampleLimit ?? 10).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    tool_name: r.tool_name ?? "desconhecida",
    error: r.error ?? "",
    entity: notFoundEntity(r.error),
    channel: r.channel ?? null,
    user_id: r.user_id ?? null,
    consultant: null,
    input: inputSample(r.arguments),
  }));

  const ids = [...new Set(samples.map((s) => s.user_id).filter(Boolean))] as string[];
  if (ids.length) {
    const profiles = await supabaseAdmin.from("profiles").select("id, name, email").in("id", ids);
    const byId = new Map(((profiles.data ?? []) as any[]).map((p) => [p.id, p.name || p.email]));
    for (const s of samples) if (s.user_id) s.consultant = byId.get(s.user_id) ?? null;
  }

  return {
    last24h: rows.filter((r) => r.created_at >= c24).length,
    last7d: rows.filter((r) => r.created_at >= c7).length,
    prev7d: rows.filter((r) => r.created_at < c7 && r.created_at >= c14).length,
    byTool: tally((r) => r.tool_name ?? "desconhecida").map(([tool, count]) => ({ tool, count })),
    byEntity: tally((r) => notFoundEntity(r.error) ?? "outra").map(([entity, count]) => ({ entity, count })),
    samples,
    lastAt: rows[0]?.created_at ?? null,
  };
}

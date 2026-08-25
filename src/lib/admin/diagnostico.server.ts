// Diagnóstico do motor por consultor e por dia: o que o Afonso tinha em
// memória (conversation_states), o que tentou gravar (assessor_tool_calls) e
// que argumentos foram recusados pela validação.

function dayRange(day: string) {
  // Dia civil de Lisboa (UTC+1 no verão) convertido para UTC.
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { from: start.toISOString(), to: end.toISOString() };
}

export type DiagToolCall = {
  id: string;
  created_at: string;
  channel: string | null;
  tool_name: string | null;
  success: boolean;
  error: string | null;
  /** Falha de validação de argumentos (invalid_args:*) vs falha de execução. */
  validation: boolean;
  latency_ms: number | null;
  arguments: Record<string, string | number | boolean | null> | null;
  result: string | null;
};

export type DiagConversationState = {
  channel: string | null;
  updated_at: string | null;
  last_property_id: string | null;
  active_person_id: string | null;
  last_entity_type: string | null;
  last_entity_id: string | null;
  last_created_resource_type: string | null;
  last_created_resource_id: string | null;
  last_intent: string | null;
  state_summary: string | null;
};

export type DiagResult = {
  day: string;
  userId: string;
  consultant: string | null;
  states: DiagConversationState[];
  toolCalls: DiagToolCall[];
  totals: {
    calls: number;
    ok: number;
    failed: number;
    validationFailed: number;
    notFound: number;
    byTool: { tool: string; ok: number; failed: number }[];
  };
};

export async function fetchConsultants(
  supabaseAdmin: any,
): Promise<{ id: string; label: string }[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email")
    .order("name", { ascending: true })
    .limit(500);
  return ((data ?? []) as any[]).map((p) => ({ id: p.id, label: p.name || p.email || p.id }));
}

export async function fetchEngineDiagnostics(
  supabaseAdmin: any,
  input: { userId: string; day: string },
): Promise<DiagResult> {
  const { inputSample, isEntityNotFound } = await import("@/lib/assessor/v3/not-found");
  const { from, to } = dayRange(input.day);

  const [states, calls, profile] = await Promise.all([
    supabaseAdmin
      .from("conversation_states")
      .select(
        "channel, updated_at, last_property_id, active_person_id, last_entity_type, last_entity_id, last_created_resource_type, last_created_resource_id, last_intent, state_summary",
      )
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("assessor_tool_calls")
      .select("id, created_at, channel, tool_name, success, error, arguments, result, latency_ms")
      .eq("user_id", input.userId)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(300),
    supabaseAdmin.from("profiles").select("name, email").eq("id", input.userId).maybeSingle(),
  ]);

  const toolCalls: DiagToolCall[] = ((calls.data ?? []) as any[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    channel: r.channel ?? null,
    tool_name: r.tool_name ?? null,
    success: !!r.success,
    error: r.error ?? null,
    validation: typeof r.error === "string" && r.error.startsWith("invalid_args"),
    latency_ms: r.latency_ms ?? null,
    arguments: inputSample(r.arguments, 12),
    result: r.result ? JSON.stringify(r.result).slice(0, 400) : null,
  }));

  const byToolMap = new Map<string, { ok: number; failed: number }>();
  for (const c of toolCalls) {
    const k = c.tool_name ?? "desconhecida";
    const e = byToolMap.get(k) ?? { ok: 0, failed: 0 };
    if (c.success) e.ok += 1; else e.failed += 1;
    byToolMap.set(k, e);
  }

  return {
    day: input.day,
    userId: input.userId,
    consultant: (profile.data as any)?.name || (profile.data as any)?.email || null,
    states: ((states.data ?? []) as any[]) as DiagConversationState[],
    toolCalls,
    totals: {
      calls: toolCalls.length,
      ok: toolCalls.filter((c) => c.success).length,
      failed: toolCalls.filter((c) => !c.success).length,
      validationFailed: toolCalls.filter((c) => c.validation).length,
      notFound: toolCalls.filter((c) => isEntityNotFound(c.error)).length,
      byTool: [...byToolMap.entries()]
        .sort((a, b) => b[1].ok + b[1].failed - (a[1].ok + a[1].failed))
        .map(([tool, v]) => ({ tool, ...v })),
    },
  };
}

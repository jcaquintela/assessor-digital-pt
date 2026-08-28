// TelemetryRepo — ponto único de escrita da telemetria do motor v3.
//
// Absorve todas as inserções em `assessor_ai_logs` e `assessor_reasoning_traces`
// que antes estavam espalhadas dentro de `runReasoningEngineInner`. É efeito
// lateral puro (observabilidade): nunca altera a resposta ao consultor e
// nunca propaga erros — falhar a registar telemetria não pode partir um turno.

export type AiTurnLog = {
  userId: string;
  channel: string;
  intent: string;
  /** "v3" | "v3-sparring" | "v3-deterministic" */
  route: string;
  latencyMs: number;
  success: boolean;
  error?: string | null;
  toolName?: string | null;
  toolSuccess?: boolean | null;
  fallbackUsed?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  confidence?: number;
  /** "assessor" por defeito; "financial" no caminho de comissões. */
  domain?: string;
};

/** Regista um turno do motor em `assessor_ai_logs`. Nunca lança. */
export async function logAiTurn(supabase: any, log: AiTurnLog): Promise<void> {
  const inputTokens = log.inputTokens ?? 0;
  const outputTokens = log.outputTokens ?? 0;
  try {
    await supabase.from("assessor_ai_logs").insert({
      user_id: log.userId,
      channel: log.channel,
      model: "reasoning-engine-v3",
      intent: log.intent,
      confidence: log.confidence ?? 1,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      latency_ms: log.latencyMs,
      success: log.success,
      error: log.error ?? null,
      domain: log.domain ?? "assessor",
      route: log.route,
      fallback_used: log.fallbackUsed ?? false,
      tool_name: log.toolName ?? null,
      tool_success: log.toolSuccess ?? null,
    } as never);
  } catch { /* noop */ }
}

export type EngineTurnTelemetry = {
  userId: string;
  channel: string;
  sourceMessageId?: string | null;
  inputContent: string;
  observations: unknown;
  hypotheses: unknown;
  searches: unknown;
  decision: unknown;
  toolCalls: { name: string; ok: boolean; error?: string | null }[];
  memoryWrites: unknown;
  reply: string;
  thinkLatencyMs: number;
  decideLatencyMs: number;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  error?: string | null;
  confidence: number;
};

/**
 * Regista o turno completo do motor: trace de raciocínio + log de utilização.
 * Devolve o `trace_id` (ou null se a escrita falhar). Nunca lança.
 */
export async function recordEngineTurn(
  supabase: any,
  t: EngineTurnTelemetry,
): Promise<string | null> {
  let traceId: string | null = null;
  try {
    const { data: traceRow } = await supabase.from("assessor_reasoning_traces").insert({
      user_id: t.userId,
      channel: t.channel,
      source_message_id: t.sourceMessageId ?? null,
      input_content: t.inputContent,
      observations: t.observations,
      hypotheses: t.hypotheses,
      searches: t.searches,
      decision: t.decision,
      tool_calls: t.toolCalls as unknown,
      memory_writes: t.memoryWrites,
      reply: t.reply,
      think_latency_ms: t.thinkLatencyMs,
      decide_latency_ms: t.decideLatencyMs,
      total_latency_ms: t.totalLatencyMs,
      input_tokens: t.inputTokens,
      output_tokens: t.outputTokens,
      success: t.success,
      error: t.error ?? null,
    } as never).select("id").maybeSingle();
    traceId = (traceRow as any)?.id ?? null;

    const failed = t.toolCalls.filter((r) => !r.ok);
    await supabase.from("assessor_ai_logs").insert({
      user_id: t.userId,
      channel: t.channel,
      model: "reasoning-engine-v3",
      billed_model: "google/gemini-3.6-flash",
      modality: "texto",
      intent: "reasoning_engine_v3",
      confidence: t.confidence,
      input_tokens: t.inputTokens,
      output_tokens: t.outputTokens,
      total_tokens: t.inputTokens + t.outputTokens,
      latency_ms: t.totalLatencyMs,
      success: t.success,
      // Sem isto, uma ferramenta que falha (ex.: `reschedule_reminder` →
      // `reminder_not_found`) deixava `error` e `tool_name` vazios e a
      // falha real ficava invisível no diagnóstico.
      tool_name: failed[0]?.name ?? t.toolCalls[0]?.name ?? null,
      tool_success: t.toolCalls.length ? failed.length === 0 : null,
      error: t.error
        ?? (failed.length
          ? failed.map((r) => `${r.name}:${r.error ?? "unknown"}`).join("; ")
          : null),
      domain: "assessor",
      route: "v3",
      fallback_used: !t.success || failed.length > 0,
    } as never);
  } catch { /* noop */ }
  return traceId;
}

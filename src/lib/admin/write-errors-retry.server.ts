// Reexecução (por um admin) de uma escrita que falhou.
//
// Corre exactamente a mesma ferramenta de domínio, com os mesmos argumentos,
// em nome do consultor original — serve para perceber em segundos se a falha
// é persistente (bug) ou foi passageira (timeout, corrida). Fica sempre
// registada em `assessor_tool_calls` (canal `admin_retry`) e na auditoria.

export type RetryOutcome = {
  ok: boolean;
  error: string | null;
  data: string | null;
  latencyMs: number;
};

export async function retryFailedWrite(
  supabaseAdmin: any,
  adminUserId: string,
  toolCallId: string,
): Promise<RetryOutcome> {
  const { data: row, error } = await supabaseAdmin
    .from("assessor_tool_calls")
    .select("id, user_id, channel, tool_name, arguments, success")
    .eq("id", toolCallId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Registo não encontrado.");
  if (row.success) throw new Error("Esta escrita não falhou — não há nada para repetir.");
  if (!row.user_id) throw new Error("Sem consultor associado; não é possível repetir com segurança.");
  if (!row.arguments) throw new Error("Sem argumentos guardados; não é possível repetir.");

  const { TOOL_REGISTRY } = await import("@/lib/assessor/v2/domain.server");
  const exec = TOOL_REGISTRY[row.tool_name as string];
  if (!exec) throw new Error(`Ferramenta desconhecida: ${row.tool_name}`);

  const t0 = Date.now();
  let result: { ok: boolean; data?: unknown; error?: string };
  try {
    result = await exec(
      {
        supabase: supabaseAdmin,
        userId: row.user_id,
        channel: "admin_retry",
        skipDuplicateCheck: true,
      } as never,
      row.arguments,
    );
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const latencyMs = Date.now() - t0;

  await supabaseAdmin.from("assessor_tool_calls").insert({
    user_id: row.user_id,
    channel: "admin_retry",
    tool_name: row.tool_name,
    arguments: row.arguments,
    result: (result.data ?? null) as never,
    success: !!result.ok,
    error: result.ok ? null : (result.error ?? "unknown"),
    latency_ms: latencyMs,
  } as never);

  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: adminUserId,
    action: "erros.retry_escrita",
    target_user_id: row.user_id,
    resource_type: "assessor_tool_calls",
    resource_id: row.id,
    reason: "Reexecução manual a partir do painel de erros de escrita.",
    metadata: {
      tool_name: row.tool_name,
      original_channel: row.channel,
      ok: !!result.ok,
      error: result.ok ? null : (result.error ?? "unknown"),
      latency_ms: latencyMs,
    },
  } as never);

  return {
    ok: !!result.ok,
    error: result.ok ? null : (result.error ?? "unknown"),
    data: result.data ? JSON.stringify(result.data, null, 2) : null,
    latencyMs,
  };
}

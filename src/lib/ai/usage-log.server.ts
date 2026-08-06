// Telemetria de utilização de IA por consultor.
//
// Todas as chamadas ao modelo (texto, imagem, áudio, documento) passam a
// deixar rasto em `assessor_ai_logs` com o MODELO REAL e a MODALIDADE. Sem
// isto o custo só existe agregado ao nível da workspace e não se sabe quem
// consome o quê. Nunca falha o fluxo: se o registo falhar, seguimos em frente.

export type AiModality = "texto" | "imagem" | "audio" | "documento";

export type AiTelemetry = {
  supabase: any;
  userId: string | null;
  channel?: string | null;
};

export type AiUsageTokens = { input: number; output: number };

/** Lê `usage` de uma resposta OpenAI-compatible do gateway. */
export function readGatewayUsage(json: any): AiUsageTokens {
  const u = json?.usage ?? {};
  return {
    input: Number(u.prompt_tokens ?? u.input_tokens ?? 0) || 0,
    output: Number(u.completion_tokens ?? u.output_tokens ?? 0) || 0,
  };
}

export async function logAiUsage(
  telemetry: AiTelemetry | undefined,
  args: {
    modality: AiModality;
    model: string;
    intent: string;
    tokens: AiUsageTokens;
    latencyMs: number;
    success: boolean;
    error?: string | null;
  },
): Promise<void> {
  if (!telemetry?.supabase || !telemetry.userId) return;
  try {
    await telemetry.supabase.from("assessor_ai_logs").insert({
      user_id: telemetry.userId,
      channel: telemetry.channel ?? null,
      model: args.model,
      billed_model: args.model,
      modality: args.modality,
      intent: args.intent,
      input_tokens: args.tokens.input,
      output_tokens: args.tokens.output,
      total_tokens: args.tokens.input + args.tokens.output,
      latency_ms: args.latencyMs,
      success: args.success,
      error: args.error ?? null,
      domain: "assessor",
      route: args.modality,
      fallback_used: false,
    } as never);
  } catch {
    /* telemetria nunca parte o fluxo do consultor */
  }
}
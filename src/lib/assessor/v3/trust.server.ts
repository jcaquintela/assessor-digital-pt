// Assistant Trust Score (ATS) — combina 5 pilares (35/25/15/15/10).
// Task Success (35) + AQS (25) + Corrections (15) + Context Preservation (15) + Safe Decisions (10).
//
// Todos os pilares são numéricos [0..1] (ou null quando não aplicável).
// Ver `TRUST MODE v1` no brief do produto.

import type { Decision } from "./types";
import type { ToolExecResult } from "./act.server";

export interface TrustSignals {
  task_success: number | null;
  aqs_score: number | null;
  corrections_count: number;
  context_preservation: number | null;
  safe_decisions: number | null;
  ats: number | null;
  notes?: string;
}

// Um turno "act" só é bem-sucedido se TODAS as tool_calls correram ok.
// Turnos "ask"/"acknowledge"/"do_nothing" não têm task a executar → null (não penaliza nem premeia).
export function computeTaskSuccess(decision: Decision, toolResults: ToolExecResult[]): number | null {
  if (decision.action !== "act") return null;
  if (toolResults.length === 0) return 0;
  return toolResults.every((r) => r.ok) ? 1 : 0;
}

// Heurística determinística. Penaliza:
// - pedir dados já presentes na memória (`asked_known_field`)
// - referir entidade errada face ao contexto activo (não implementado a fundo — placeholder 1.0)
// - criar duplicados (detectado via `duplicate` no error do tool ou memory_writes contraditórias)
export function computeContextPreservation(input: {
  decision: Decision;
  toolResults: ToolExecResult[];
  conversationState: any | null;
  historyPreview: string;
  currentMessage: string;
}): number {
  const { decision, toolResults, conversationState, currentMessage } = input;
  let score = 1;

  // Pergunta algo que já sabia? Se DECIDE fez "ask" mas o estado já tinha o campo.
  if (decision.action === "ask" && conversationState) {
    const reply = decision.natural_reply.toLowerCase();
    const knownFields: Array<[string, string]> = [
      [/quem|qual\s+cliente|que\s+pessoa/i.source, conversationState.active_person_id],
      [/qual\s+im[oó]vel|que\s+im[oó]vel|qual\s+casa/i.source, conversationState.last_property_id],
    ];
    for (const [rx, val] of knownFields) {
      if (val && new RegExp(rx, "i").test(reply)) { score -= 0.5; break; }
    }
  }

  // Criou duplicado? Alguns tools devolvem error "duplicate" quando idempotência dispara.
  if (toolResults.some((r) => (r.error ?? "").toLowerCase().includes("duplicate"))) {
    score -= 0.4;
  }

  // Ignora sinal se mensagem é trivial (saudação curta).
  if (currentMessage.trim().length < 4) return 1;

  return Math.max(0, Math.min(1, score));
}

// Decisões seguras: nunca afirmar sucesso sem tool_calls ok, nunca inventar.
// Detecta preclaim ("Feito", "Registei") na natural_reply quando não houve tools ok.
export function computeSafeDecisions(input: {
  decision: Decision;
  toolResults: ToolExecResult[];
  finalReply: string;
}): number {
  const { decision, toolResults, finalReply } = input;
  let score = 1;
  const preclaim = /^\s*(feito|pronto|registei|guardei|criei|marquei|apaguei|actualizei|atualizei)\b/i;
  const actuallyOk = decision.action === "act" && toolResults.length > 0 && toolResults.every((r) => r.ok);
  if (preclaim.test(decision.natural_reply) && !actuallyOk) score -= 0.6;
  // A resposta final foi reescrita pelo sanitize (perdeu o "Feito") → sinal de decisão insegura pré-sanitize.
  if (preclaim.test(decision.natural_reply) && !preclaim.test(finalReply) && !actuallyOk) score = Math.min(score, 0.4);
  return Math.max(0, Math.min(1, score));
}

// ATS = 35*task + 25*aqs + 15*(1-corr/max) + 15*context + 10*safe. Pesos ignoram pilares null.
export function computeATS(input: {
  task_success: number | null;
  aqs_score: number | null;
  corrections_count: number;
  context_preservation: number | null;
  safe_decisions: number | null;
}): number | null {
  const CORR_MAX = 3; // 3+ correções no mesmo turno → 0
  const correctionsPillar = 1 - Math.min(1, input.corrections_count / CORR_MAX);
  const pillars: Array<[number, number | null]> = [
    [35, input.task_success],
    [25, input.aqs_score],
    [15, correctionsPillar],
    [15, input.context_preservation],
    [10, input.safe_decisions],
  ];
  let sum = 0, weight = 0;
  for (const [w, v] of pillars) {
    if (v == null) continue;
    sum += w * v; weight += w;
  }
  if (weight === 0) return null;
  return Number(((sum / weight) * 100).toFixed(1));
}

export async function persistTrustScore(
  supabase: any,
  input: {
    userId: string;
    channel: string;
    traceId: string | null;
    signals: TrustSignals;
  },
): Promise<void> {
  try {
    await supabase.from("assistant_trust_scores").insert({
      user_id: input.userId,
      channel: input.channel,
      trace_id: input.traceId,
      task_success: input.signals.task_success,
      aqs_score: input.signals.aqs_score,
      corrections_count: input.signals.corrections_count,
      context_preservation: input.signals.context_preservation,
      safe_decisions: input.signals.safe_decisions,
      ats: input.signals.ats,
      notes: input.signals.notes ?? null,
    } as never);
  } catch { /* noop */ }
}
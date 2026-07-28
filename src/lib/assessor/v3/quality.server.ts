// Assistant Quality Score (AQS) — 4 sinais 0/1 por turno v3.
// Aplica-se depois de OBSERVE→THINK→SEARCH→DECIDE→ACT terminarem.

import { hasHumanTone } from "../culture/sanitize";
import type { Decision } from "./types";
import type { ToolExecResult } from "./act.server";

export interface QualitySignals {
  understood_first_try: boolean | null;
  reformulated: boolean | null;
  executed_successfully: boolean | null;
  human_tone: boolean | null;
  score: number | null;
  notes?: string;
}

// `previousUserTurnAt` = timestamp da mensagem imediatamente anterior do
// consultor no mesmo canal (undefined se não houver).
export function computeQualitySignals(input: {
  decision: Decision;
  toolResults: ToolExecResult[];
  reply: string;
  previousUserTurnAt?: Date | null;
  now?: Date;
}): QualitySignals {
  const now = input.now ?? new Date();
  const { decision, toolResults, reply } = input;

  // Compreendeu à primeira: decisão diferente de "ask" no primeiro turno.
  // Se a última mensagem do consultor foi há < 60s, este turno é
  // provavelmente uma reformulação — o "primeiro turno" foi antes.
  const understood_first_try = decision.action === "ask" ? false : true;

  const reformulated = input.previousUserTurnAt
    ? now.getTime() - input.previousUserTurnAt.getTime() < 60_000
    : false;

  let executed_successfully: boolean | null;
  if (decision.action === "act") {
    executed_successfully = toolResults.length > 0 && toolResults.every((t) => t.ok);
  } else if (decision.action === "acknowledge" || decision.action === "do_nothing" || decision.action === "ask") {
    executed_successfully = true; // N/A — não devia executar nada.
  } else {
    executed_successfully = null;
  }

  const human_tone = hasHumanTone(reply);

  const signals = [understood_first_try, reformulated === true ? false : true, executed_successfully, human_tone]
    .filter((v): v is boolean => typeof v === "boolean");
  const score = signals.length
    ? Number((signals.filter(Boolean).length / signals.length).toFixed(3))
    : null;

  return {
    understood_first_try,
    reformulated,
    executed_successfully,
    human_tone,
    score,
  };
}

export async function persistQualityScore(
  supabase: any,
  input: {
    userId: string;
    channel: string;
    traceId: string | null;
    signals: QualitySignals;
  },
): Promise<void> {
  try {
    await supabase.from("assessor_quality_scores").insert({
      user_id: input.userId,
      channel: input.channel,
      trace_id: input.traceId,
      understood_first_try: input.signals.understood_first_try,
      reformulated: input.signals.reformulated,
      executed_successfully: input.signals.executed_successfully,
      human_tone: input.signals.human_tone,
      score: input.signals.score,
      notes: input.signals.notes ?? null,
    } as never);
  } catch { /* noop */ }
}
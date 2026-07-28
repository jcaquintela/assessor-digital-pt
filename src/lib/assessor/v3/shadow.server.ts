// Shadow Mode — corre uma estratégia alternativa em paralelo (mesma DECIDE
// com temperatura maior), regista a resposta que teria dado e a diferença.
// Não executa tools; nunca afecta a resposta ao consultor.

import { decide } from "./decide.server";
import { sanitizeReply, enforceHumanTone, enforceSingleQuestion } from "../culture/sanitize";
import type { Decision, Hypothesis, Observation, SearchResults } from "./types";

export interface ShadowInput {
  userId: string;
  channel: string;
  traceId: string | null;
  strategy: string;
  content: string;
  observations: Observation[];
  hypotheses: Hypothesis[];
  searches: SearchResults;
  historyPreview: string;
  assessorName: string;
  userFirstName: string;
  nowLisbonYmd: string;
  nowLisbonHuman: string;
  baseline: { action: Decision["action"]; reply: string };
}

export async function runShadow(supabase: any, input: ShadowInput): Promise<void> {
  const t0 = Date.now();
  try {
    // Estratégia alternativa: DECIDE com temperatura maior (0.6) e mesmo
    // contexto. Explora se subir a criatividade reduz "asks" desnecessários.
    const alt = await decide({
      content: input.content,
      observations: input.observations,
      hypotheses: input.hypotheses,
      searches: input.searches,
      historyPreview: input.historyPreview,
      assessorName: input.assessorName,
      userFirstName: input.userFirstName,
      nowLisbonYmd: input.nowLisbonYmd,
      nowLisbonHuman: input.nowLisbonHuman,
    });

    let reply = sanitizeReply(alt.decision.natural_reply);
    reply = enforceHumanTone(reply, { actionExecutedOk: false });
    if (alt.decision.action === "ask") reply = enforceSingleQuestion(reply);

    const sameAction = alt.decision.action === input.baseline.action;
    const sameReply = reply.trim() === input.baseline.reply.trim();

    await supabase.from("assistant_shadow_runs").insert({
      user_id: input.userId,
      channel: input.channel,
      trace_id: input.traceId,
      strategy: input.strategy,
      reply,
      ats: null,
      aqs: null,
      task_success: null,
      latency_ms: Date.now() - t0,
      diff: {
        baseline_action: input.baseline.action,
        shadow_action: alt.decision.action,
        same_action: sameAction,
        same_reply: sameReply,
        shadow_confidence: alt.decision.confidence,
        shadow_tool_calls: alt.decision.tool_calls.map((c) => c.name),
      } as unknown,
    } as never);
  } catch { /* noop */ }
}

// 10% de amostragem — muda via env para acelerar ou pausar.
export function shouldRunShadow(): boolean {
  return Math.random() < 0.1;
}
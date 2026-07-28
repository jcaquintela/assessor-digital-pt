// Reasoning Engine v3 — orquestrador central (OBSERVE → THINK → SEARCH → DECIDE → ACT).

import type { EngineInput, EngineOutcome } from "../engine.server";
import { observe } from "./observe.server";
import { think } from "./think.server";
import { search } from "./search.server";
import { decide } from "./decide.server";
import { executeToolCalls, applyMemoryWrites } from "./act.server";
import { sanitizeReply, enforceHumanTone, enforceSingleQuestion, NATURAL_FALLBACKS } from "../culture/sanitize";
import { computeQualitySignals, persistQualityScore } from "./quality.server";
import {
  computeATS, computeContextPreservation, computeSafeDecisions, computeTaskSuccess,
  persistTrustScore, type TrustSignals,
} from "./trust.server";
import { captureCorrection, looksLikeCorrection } from "./corrections.server";
import { reflect, type ReflectionTrigger } from "./reflection.server";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import type { DomainContext } from "../v2/domain.server";

const HISTORY_LIMIT = 6;

function nowLisbonHuman(): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}
function nowLisbonYmd(): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return `${m.year}-${m.month}-${m.day}`;
}
function toHistoryPreview(rows: Array<{ role: string; content: string }>): string {
  return [...rows].reverse()
    .filter((r) => r?.content && (r.role === "user" || r.role === "assistant"))
    .slice(-HISTORY_LIMIT)
    .map((r) => `${r.role === "user" ? "consultor" : "assessor"}: ${r.content}`)
    .join("\n");
}

export async function runReasoningEngine(input: EngineInput): Promise<EngineOutcome> {
  const started = Date.now();
  const { supabase, userId, channel, content, sourceMessageId } = input;
  if (!userId) return { reply: NATURAL_FALLBACKS.unassociated };
  const trimmed = content.trim();
  if (!trimmed) return { reply: NATURAL_FALLBACKS.didNotUnderstand };

  const ctx: DomainContext = { supabase, userId, channel, sourceMessageId: sourceMessageId ?? null };

  const [{ data: prof }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("name, assessor_name").eq("id", userId).maybeSingle(),
    supabase
      .from("assessor_messages")
      .select("role, content, created_at, id")
      .eq("user_id", userId).eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  const assessorName = sanitizeAssessorName((prof as any)?.assessor_name ?? "") || ASSESSOR_NAME_DEFAULT;
  const userFirstName = String((prof as any)?.name ?? "").split(/\s+/)[0] || "";
  const historyPreview = toHistoryPreview((recentRows as any[]) ?? []);

  // Detecção de correção precoce — antes de gastar OBSERVE/THINK/DECIDE.
  const lastAssistantRow = ((recentRows as any[]) ?? []).find((r) => r?.role === "assistant");
  const lastAssistantAt: Date | null = lastAssistantRow?.created_at ? new Date(lastAssistantRow.created_at) : null;
  const lastAssistantReply: string = String(lastAssistantRow?.content ?? "");
  const isCorrection = looksLikeCorrection(trimmed, lastAssistantAt);

  // 1) OBSERVE
  const observations = observe(trimmed);

  // 2) THINK
  const thinkR = await think({ content: trimmed, observations, historyPreview });

  // 3) SEARCH — inclui sempre state + pending_action.
  const recommended = Array.from(new Set([
    ...thinkR.output.recommended_searches,
    "conversation_state" as const,
    "pending_action" as const,
  ]));
  const searches = await search(ctx, observations, recommended);

  // 4) DECIDE
  const decideR = await decide({
    content: trimmed,
    observations,
    hypotheses: thinkR.output.hypotheses,
    searches,
    historyPreview,
    assessorName,
    userFirstName,
    nowLisbonYmd: nowLisbonYmd(),
    nowLisbonHuman: nowLisbonHuman(),
  });

  // 5) ACT — só executa se DECIDE disse "act".
  const shouldAct = decideR.decision.action === "act" && decideR.decision.tool_calls.length > 0;
  const toolResults = shouldAct ? await executeToolCalls(ctx, decideR.decision.tool_calls) : [];
  const allOk = toolResults.every((r) => r.ok);

  await applyMemoryWrites(ctx, decideR.decision.memory_writes);

  let reply = sanitizeReply(decideR.decision.natural_reply);
  if (shouldAct && !allOk) {
    reply = "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?";
  }
  // Ajustes culturais finais: sem "Feito" pré-execução, sem vocabulário
  // técnico, no máximo 2 frases, uma pergunta de cada vez.
  reply = enforceHumanTone(reply, { actionExecutedOk: shouldAct && allOk });
  if (decideR.decision.action === "ask") {
    reply = enforceSingleQuestion(reply);
  }
  if (!reply) reply = NATURAL_FALLBACKS.didNotUnderstand;

  const totalLatencyMs = Date.now() - started;
  const inputTokens = thinkR.usage.inputTokens + decideR.usage.inputTokens;
  const outputTokens = thinkR.usage.outputTokens + decideR.usage.outputTokens;
  const success = allOk && !decideR.error && !thinkR.error;

  let traceId: string | null = null;
  try {
    const { data: traceRow } = await supabase.from("assessor_reasoning_traces").insert({
      user_id: userId,
      channel,
      source_message_id: sourceMessageId ?? null,
      input_content: trimmed,
      observations: observations as unknown,
      hypotheses: thinkR.output.hypotheses as unknown,
      searches: searches as unknown,
      decision: decideR.decision as unknown,
      tool_calls: toolResults as unknown,
      memory_writes: decideR.decision.memory_writes as unknown,
      reply,
      think_latency_ms: thinkR.latencyMs,
      decide_latency_ms: decideR.latencyMs,
      total_latency_ms: totalLatencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      success,
      error: (decideR.error ?? thinkR.error) ?? null,
    } as never).select("id").maybeSingle();
    traceId = (traceRow as any)?.id ?? null;

    await supabase.from("assessor_ai_logs").insert({
      user_id: userId,
      channel,
      model: "reasoning-engine-v3",
      intent: "reasoning_engine_v3",
      confidence: decideR.decision.confidence,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      latency_ms: totalLatencyMs,
      success,
      error: (decideR.error ?? thinkR.error) ?? null,
      domain: "assessor",
      route: "v3",
      fallback_used: !success,
    } as never);
  } catch { /* noop */ }

  // AQS — Assistant Quality Score.
  let aqsScore: number | null = null;
  try {
    const prevUserAt = ((recentRows as any[]) ?? [])
      .find((r) => r?.role === "user")?.created_at ?? null;
    const signals = computeQualitySignals({
      decision: decideR.decision,
      toolResults,
      reply,
      previousUserTurnAt: prevUserAt ? new Date(prevUserAt) : null,
    });
    aqsScore = signals.score;
    await persistQualityScore(supabase, { userId, channel, traceId, signals });
  } catch { /* noop */ }

  // Correção do consultor → grava e conta para o ATS deste turno.
  let correctionRecord: { id: string; category: string } | null = null;
  if (isCorrection) {
    try {
      correctionRecord = await captureCorrection(supabase, {
        userId,
        channel,
        conversationId: channel,
        previousTraceId: null,
        originalAssistantReply: lastAssistantReply,
        correctionMessage: trimmed,
      });
    } catch { /* noop */ }
  }

  // ATS — Assistant Trust Score.
  let atsValue: number | null = null;
  try {
    const searchesForContext = searches;
    const contextPreservation = computeContextPreservation({
      decision: decideR.decision,
      toolResults,
      conversationState: (searchesForContext as any).conversation_state ?? null,
      historyPreview,
      currentMessage: trimmed,
    });
    const safeDecisions = computeSafeDecisions({
      decision: decideR.decision,
      toolResults,
      finalReply: reply,
    });
    const taskSuccess = computeTaskSuccess(decideR.decision, toolResults);
    const signals: TrustSignals = {
      task_success: taskSuccess,
      aqs_score: aqsScore,
      corrections_count: correctionRecord ? 1 : 0,
      context_preservation: contextPreservation,
      safe_decisions: safeDecisions,
      ats: null,
    };
    signals.ats = computeATS({
      task_success: signals.task_success,
      aqs_score: signals.aqs_score,
      corrections_count: signals.corrections_count,
      context_preservation: signals.context_preservation,
      safe_decisions: signals.safe_decisions,
    });
    atsValue = signals.ats;
    await persistTrustScore(supabase, { userId, channel, traceId, signals });
  } catch { /* noop */ }

  // Reflection Engine — dispara em background quando o turno é fraco.
  const shouldReflect =
    (aqsScore != null && aqsScore < 0.80) ||
    (atsValue != null && atsValue < 85) ||
    !!correctionRecord;
  if (shouldReflect) {
    const trigger: ReflectionTrigger = correctionRecord
      ? "user_correction"
      : (atsValue != null && atsValue < 85 ? "low_ats" : "low_aqs");
    // Fire-and-forget para não atrasar a resposta ao consultor.
    void reflect(supabase, {
      userId,
      traceId,
      correctionId: correctionRecord?.id ?? null,
      trigger,
      message: trimmed,
      assistantReply: reply,
      decisionAction: decideR.decision.action,
      observations,
      searches,
      aqs: aqsScore,
      ats: atsValue,
      correctionCategory: correctionRecord?.category ?? null,
      correctionMessage: correctionRecord ? trimmed : null,
    });
  }

  return { reply };
}
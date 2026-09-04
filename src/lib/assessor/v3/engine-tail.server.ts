// Cauda do turno do motor v3 — tudo o que acontece DEPOIS da execução das
// ferramentas: finalização/tom da resposta, rede de segurança (Diversos),
// telemetria do turno, AQS, captura de correção, ATS, reflexão, shadow mode,
// ofertas de arranque/perfil e âncora de pergunta em aberto.
//
// Este módulo é uma extração literal da cauda de `runReasoningEngineInner`:
// a lógica e a ORDEM de execução são idênticas — só mudou a localização.

import { enforceHumanTone, enforceSingleQuestion, NATURAL_FALLBACKS } from "../culture/sanitize";
import { suppressRejectedQuestion } from "./rejected-question";
import { describeWrites, enforceTransparentConfirmation } from "./write-receipt";
import { composeAsksReply, type PendingAskItem } from "./pending-asks";
import { applySafetyNet, buildArchiveContent } from "./safety-net.server";
import { formatQueryResults, isQueryTool } from "./query-results";
import { computeQualitySignals, persistQualityScore } from "./quality.server";
import { captureCorrection } from "./corrections.server";
import {
  computeATS, computeContextPreservation, computeSafeDecisions, computeTaskSuccess,
  persistTrustScore, type TrustSignals,
} from "./trust.server";
import { reflect, type ReflectionTrigger } from "./reflection.server";
import { runShadow, shouldRunShadow } from "./shadow.server";
import { recordEngineTurn } from "./telemetry-repo.server";
import {
  appendOffer, GOALS_QUESTION, NAME_QUESTION, nextOnboardingOffer, type OnboardingState,
} from "./onboarding";
import { markOnboardingOffered } from "./onboarding.server";
import type { TurnOutcome } from "./safety-net.server";
import type { DomainContext } from "../v2/domain.server";

// Padrão de linguagem de incompreensão (cópia da constante do motor).
const NOT_UNDERSTOOD_RE = /n[ãa]o\s+(percebi|entendi|compreendi)|podes\s+explicar\s+de\s+outra\s+forma/i;

type ToolResult = { name: string; ok: boolean; data?: unknown; error?: string; latencyMs?: number };

// ---------------------------------------------------------------------------
// 1. Finalização e tom da resposta
// ---------------------------------------------------------------------------

export async function finalizeReplyText(params: {
  reply: string;
  toolResults: ToolResult[];
  cancelTool: unknown;
  decideAction: string;
  shouldAct: boolean;
  allOk: boolean;
  prospectingActed: boolean;
  rescheduleAsk: boolean;
  isCorrection: boolean;
  lastAssistantReply: string;
  aiUnavailable: boolean;
  /** Itens do turno que ficaram à espera de confirmação (pessoa/imóvel). */
  pendingAsks?: PendingAskItem[];
}): Promise<{ reply: string; executedOk: boolean }> {
  const { toolResults, cancelTool, shouldAct, allOk, prospectingActed, rescheduleAsk } = params;
  // Uma pergunta por responder não é uma acção concluída: se o tom humano
  // achar que está tudo feito, transforma a pergunta em "Feito.".
  const hasPendingAsks = (params.pendingAsks ?? []).length > 0;
  let reply = params.reply;

  const queryReply = toolResults.some((t) => t.ok && isQueryTool(t.name))
    ? formatQueryResults(toolResults as any)
    : null;

  // Rascunho de resposta a email: apresentação determinística em três bolhas
  // (intro + corpo isolado para copiar + pergunta de confirmação). Nunca
  // deixamos a IA redigir esta parte — o corpo tem de sair exactamente como
  // foi gravado e como está na caixa do consultor.
  const emailDraftTool = toolResults.find(
    (t) => (t.name === "draft_email_reply" || t.name === "compose_email_to_contact") && t.ok,
  );
  let emailDraftReply: string | null = null;
  if (emailDraftTool) {
    const d = (emailDraftTool.data ?? {}) as Record<string, any>;
    const { withSuggestionAndQuestion } = await import("../culture/suggested-message");
    if (d.body && d.draft_id) {
      const intro = [d.note ? String(d.note) : "", String(d.intro)].filter(Boolean).join(" ");
      emailDraftReply = withSuggestionAndQuestion(
        intro,
        String(d.preview ?? d.body),
        String(d.question),
      );
    } else if (d.needs_person_choice || d.needs_email_address) {
      emailDraftReply = String(d.question ?? "De quem estamos a falar?");
    } else if (d.needs_person_name) {
      emailDraftReply = "A quem queres que escreva? Diz-me o nome.";
    } else if (d.needs_email_choice) {
      emailDraftReply = String(d.question ?? "A qual dos emails queres responder?");
    } else if (d.not_found) {
      emailDraftReply = "Não encontrei esse email na tua caixa. Dizes-me o remetente ou o assunto?";
    } else if (d.needs_reconnect) {
      emailDraftReply = "O acesso ao teu email expirou. Liga outra vez a caixa em Definições e eu preparo o rascunho.";
    } else if (d.not_connected) {
      emailDraftReply = "Ainda não tens caixa de email ligada. Liga o Gmail ou o Outlook e eu preparo o rascunho.";
    } else if (d.plan_required) {
      emailDraftReply = "O email faz parte do plano Pro. Queres que te explique o que muda?";
    }
  }
  // A lista de desmarcações também não passa pelo corte de 2 frases.
  if (emailDraftReply) {
    reply = emailDraftReply;
  } else if (queryReply || cancelTool) {
    if (queryReply) reply = queryReply;
  } else {
    reply = enforceHumanTone(reply, {
      // Uma pergunta de desambiguação não é uma acção executada: se dissermos
      // que sim, o tom humano transforma a pergunta em "Feito.".
      actionExecutedOk: ((shouldAct && allOk) || prospectingActed) && !rescheduleAsk && !hasPendingAsks,
    });
    if (params.decideAction === "ask") {
      reply = enforceSingleQuestion(reply);
    }
  }
  // Ordem correcta: o outcome real (execução) manda sobre a frase gerada.
  const executedOk = ((shouldAct && allOk) || prospectingActed) && !rescheduleAsk;
  if (executedOk && !hasPendingAsks) {
    const soundsLikeFailure =
      !reply ||
      reply === NATURAL_FALLBACKS.didNotUnderstand ||
      reply === NATURAL_FALLBACKS.aiDown ||
      NOT_UNDERSTOOD_RE.test(reply);
    if (soundsLikeFailure) reply = NATURAL_FALLBACKS.done;
  }
  if (params.isCorrection && !rescheduleAsk) {
    reply = suppressRejectedQuestion(reply, params.lastAssistantReply);
  }
  if (!reply) {
    reply = params.aiUnavailable ? NATURAL_FALLBACKS.aiDown : NATURAL_FALLBACKS.didNotUnderstand;
  }
  if (params.aiUnavailable && !shouldAct && !prospectingActed && NOT_UNDERSTOOD_RE.test(reply)) {
    reply = NATURAL_FALLBACKS.aiDown;
  }
  return { reply, executedOk };
}

// ---------------------------------------------------------------------------
// 2. Rede de segurança "nada se perde"
// ---------------------------------------------------------------------------

export function resolveArchiveOutcome(params: {
  archiveOutcome: TurnOutcome;
  archiveReason: string | null;
  shouldAct: boolean;
  prospectingActed: boolean;
  aiUnavailable: boolean;
  reply: string;
  decideError: string | null;
  thinkError: string | null;
}): { outcome: TurnOutcome; reason: string | null } {
  let outcome = params.archiveOutcome;
  let reason = params.archiveReason;
  if (outcome === "executed_ok" && !params.shouldAct && !params.prospectingActed) {
    if (params.aiUnavailable) {
      outcome = "service_down";
      reason = params.decideError ?? params.thinkError ?? "serviço de IA indisponível";
    } else {
      const isFallbackReply =
        params.reply === NATURAL_FALLBACKS.didNotUnderstand ||
        params.reply === NATURAL_FALLBACKS.aiDown ||
        NOT_UNDERSTOOD_RE.test(params.reply);
      if (isFallbackReply || params.decideError || params.thinkError) {
        outcome = "not_understood";
        reason = params.decideError ?? params.thinkError ?? "não percebi a mensagem";
      }
    }
  }
  return { outcome, reason };
}

// ---------------------------------------------------------------------------
// 3. AQS
// ---------------------------------------------------------------------------

export async function scoreQuality(supabase: any, params: {
  userId: string;
  channel: string;
  traceId: string | null;
  sourceMessageId: string | null;
  trimmed: string;
  reply: string;
  decision: any;
  toolResults: ToolResult[];
  recentRows: any[];
  lastAssistantReply: string;
}): Promise<number | null> {
  try {
    // A mensagem ACTUAL do consultor já está gravada em `recentRows`; se a
    // apanhássemos aqui, a diferença seria ≈0 s e quase tudo virava
    // "reformulação". Excluímo-la explicitamente.
    const userRows = (params.recentRows ?? []).filter((r) => r?.role === "user");
    let curIdx = params.sourceMessageId
      ? userRows.findIndex((r) => r?.id === params.sourceMessageId)
      : -1;
    if (curIdx < 0) {
      curIdx = userRows.findIndex((r) => String(r?.content ?? "").trim() === params.trimmed);
    }
    // A repetição genuína tem o mesmo texto: só saltamos UMA ocorrência.
    const prevUserRow = userRows[(curIdx < 0 ? -1 : curIdx) + 1] ?? null;
    const prevUserAt = prevUserRow?.created_at ?? null;
    const signals = computeQualitySignals({
      decision: params.decision,
      toolResults: params.toolResults as any,
      reply: params.reply,
      previousUserTurnAt: prevUserAt ? new Date(prevUserAt) : null,
      message: params.trimmed,
      previousUserMessage: prevUserRow ? String(prevUserRow.content ?? "") : null,
      lastAssistantReply: params.lastAssistantReply,
    });
    await persistQualityScore(supabase, {
      userId: params.userId, channel: params.channel, traceId: params.traceId, signals,
    });
    return signals.score;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// 4. Correção do consultor
// ---------------------------------------------------------------------------

export async function captureTailCorrection(supabase: any, params: {
  isCorrection: boolean;
  userId: string;
  channel: string;
  lastAssistantReply: string;
  trimmed: string;
}): Promise<{ id: string; category: string } | null> {
  if (!params.isCorrection) return null;
  try {
    return await captureCorrection(supabase, {
      userId: params.userId,
      channel: params.channel,
      conversationId: params.channel,
      previousTraceId: null,
      originalAssistantReply: params.lastAssistantReply,
      correctionMessage: params.trimmed,
    });
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// 5. ATS
// ---------------------------------------------------------------------------

export async function scoreTrust(supabase: any, params: {
  userId: string;
  channel: string;
  traceId: string | null;
  decision: any;
  toolResults: ToolResult[];
  searches: any;
  historyPreview: string;
  trimmed: string;
  reply: string;
  aqsScore: number | null;
  hasCorrection: boolean;
}): Promise<number | null> {
  try {
    const contextPreservation = computeContextPreservation({
      decision: params.decision,
      toolResults: params.toolResults as any,
      conversationState: (params.searches as any)?.conversation_state ?? null,
      historyPreview: params.historyPreview,
      currentMessage: params.trimmed,
    });
    const safeDecisions = computeSafeDecisions({
      decision: params.decision,
      toolResults: params.toolResults as any,
      finalReply: params.reply,
    });
    const taskSuccess = computeTaskSuccess(params.decision, params.toolResults as any);
    const signals: TrustSignals = {
      task_success: taskSuccess,
      aqs_score: params.aqsScore,
      corrections_count: params.hasCorrection ? 1 : 0,
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
    await persistTrustScore(supabase, {
      userId: params.userId, channel: params.channel, traceId: params.traceId, signals,
    });
    return signals.ats;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// 6. Reflexão + shadow mode (ambos fire-and-forget)
// ---------------------------------------------------------------------------

export function maybeReflect(supabase: any, params: {
  userId: string;
  traceId: string | null;
  aqsScore: number | null;
  atsValue: number | null;
  correctionRecord: { id: string; category: string } | null;
  trimmed: string;
  reply: string;
  decision: any;
  observations: unknown;
  searches: unknown;
}): void {
  const shouldReflect =
    (params.aqsScore != null && params.aqsScore < 0.80) ||
    (params.atsValue != null && params.atsValue < 85) ||
    !!params.correctionRecord;
  if (!shouldReflect) return;
  const trigger: ReflectionTrigger = params.correctionRecord
    ? "user_correction"
    : (params.atsValue != null && params.atsValue < 85 ? "low_ats" : "low_aqs");
  // Fire-and-forget para não atrasar a resposta ao consultor.
  void reflect(supabase, {
    userId: params.userId,
    traceId: params.traceId,
    correctionId: params.correctionRecord?.id ?? null,
    trigger,
    message: params.trimmed,
    assistantReply: params.reply,
    decisionAction: params.decision.action,
    observations: params.observations as any,
    searches: params.searches as any,
    aqs: params.aqsScore,
    ats: params.atsValue,
    correctionCategory: params.correctionRecord?.category ?? null,
    correctionMessage: params.correctionRecord ? params.trimmed : null,
  });
}

export function maybeShadow(supabase: any, params: {
  userId: string;
  channel: string;
  traceId: string | null;
  trimmed: string;
  observations: any;
  hypotheses: any;
  searches: any;
  historyPreview: string;
  assessorName: string;
  userFirstName: string;
  nowLisbonYmd: string;
  nowLisbonHuman: string;
  decision: any;
  reply: string;
}): void {
  if (!shouldRunShadow()) return;
  void runShadow(supabase, {
    userId: params.userId, channel: params.channel, traceId: params.traceId,
    strategy: "decide_temp_0.6",
    content: params.trimmed,
    observations: params.observations,
    hypotheses: params.hypotheses,
    searches: params.searches,
    historyPreview: params.historyPreview,
    assessorName: params.assessorName,
    userFirstName: params.userFirstName,
    nowLisbonYmd: params.nowLisbonYmd,
    nowLisbonHuman: params.nowLisbonHuman,
    baseline: { action: params.decision.action, reply: params.reply },
  });
}

// ---------------------------------------------------------------------------
// 7. Ofertas: arranque leve e perfil "por gotas"
// ---------------------------------------------------------------------------

export async function maybeOfferOnboarding(supabase: any, params: {
  userId: string;
  reply: string;
  onboarding: OnboardingState;
  assessorName: string;
  sparringActive: boolean;
  decisionAction: string;
  toolResults: ToolResult[];
  hasPending: boolean;
}): Promise<{ reply: string; offered: boolean }> {
  let reply = params.reply;
  let offeredOnboarding = false;
  try {
    const busyWithTask =
      params.sparringActive ||
      params.decisionAction === "act" ||
      params.decisionAction === "ask" ||
      params.toolResults.length > 0 ||
      params.hasPending;
    const offer = nextOnboardingOffer(params.onboarding, {
      replyIsQuestion: reply.includes("?"),
      busyWithTask,
    });
    if (offer === "name") {
      await markOnboardingOffered(supabase, params.userId, "name_asked", params.onboarding.offers);
      reply = appendOffer(reply, NAME_QUESTION(params.assessorName));
      offeredOnboarding = true;
    } else if (offer === "goals") {
      await markOnboardingOffered(supabase, params.userId, "goals_asked", params.onboarding.offers);
      reply = appendOffer(reply, GOALS_QUESTION);
      offeredOnboarding = true;
    }
  } catch { /* noop */ }
  return { reply, offered: offeredOnboarding };
}

export async function maybeOfferProfileDrip(supabase: any, params: {
  userId: string;
  channel: string;
  sourceMessageId: string | null;
  reply: string;
  decisionAction: string;
  toolResults: ToolResult[];
  hasPending: boolean;
  onboarding: OnboardingState;
}): Promise<{ reply: string; offered: boolean }> {
  let reply = params.reply;
  let offeredProfileQuestion = false;
  try {
    const {
      loadProfileDripState, markProfileQuestionAsked, recordProfileQuestion, isCalmDay,
    } = await import("./profile-drip.server");
    const { composeDripReply, nextProfileQuestion, replyHasResults } = await import("./profile-drip");
    const dripState = await loadProfileDripState(supabase, params.userId);
    const anchor =
      params.toolResults.some(
        (t) => t.ok && (t.name === "create_prospecting_lead" || t.name === "create_property"),
      )
        ? ("work_area" as const)
        : null;
    const busyWithTask =
      params.decisionAction === "ask" || params.hasPending || params.toolResults.some((t) => !t.ok);
    const offer = nextProfileQuestion(dripState, {
      replyIsQuestion: reply.includes("?"),
      replyHasResults: replyHasResults(reply),
      busyWithTask,
      anchor,
      calmDay: anchor ? true : await isCalmDay(supabase, params.userId),
      onboardingPending:
        params.onboarding.stage !== "done" && params.onboarding.stage !== "skipped",
    });
    if (offer) {
      await markProfileQuestionAsked(supabase, params.userId, dripState, offer.key, offer.withNotice);
      await recordProfileQuestion(supabase, {
        userId: params.userId, channel: params.channel, key: offer.key, question: offer.question,
        sourceMessageId: params.sourceMessageId ?? null,
      });
      reply = composeDripReply(reply, offer);
      offeredProfileQuestion = true;
    }
  } catch { /* noop — nunca bloquear a resposta */ }
  return { reply, offered: offeredProfileQuestion };
}

// ---------------------------------------------------------------------------
// 8. Âncora de pergunta em aberto
// ---------------------------------------------------------------------------

export async function maybeRecordOpenQuestion(supabase: any, params: {
  userId: string;
  channel: string;
  sourceMessageId: string | null;
  reply: string;
  decisionAction: string;
  toolResults: ToolResult[];
  hasPending: boolean;
  sparringActive: boolean;
  offeredProfileQuestion: boolean;
}): Promise<void> {
  const askedWithDraft =
    params.decisionAction === "ask" ||
    params.decisionAction === "act" ||
    params.hasPending;
  if (params.sparringActive || params.offeredProfileQuestion) return;
  if (params.toolResults.length !== 0 || askedWithDraft) return;
  try {
    const { recordOpenQuestion } = await import("./open-question.server");
    await recordOpenQuestion(supabase, {
      userId: params.userId, channel: params.channel, question: params.reply,
      sourceMessageId: params.sourceMessageId ?? null,
      toolsExecuted: params.toolResults.length,
    });
  } catch { /* noop — nunca bloquear a resposta */ }
}

// ---------------------------------------------------------------------------
// Orquestrador: mantém a ordem exacta dos blocos.
// ---------------------------------------------------------------------------

export interface EngineTailInput {
  ctx: DomainContext;
  supabase: any;
  userId: string;
  channel: string;
  sourceMessageId: string | null;
  trimmed: string;
  reply: string;
  toolResults: ToolResult[];
  pendingAsks?: PendingAskItem[];
  cancelTool: unknown;
  leadTool: ToolResult | undefined;
  decideR: any;
  thinkR: any;
  observations: any;
  searches: any;
  historyPreview: string;
  recentRows: any[];
  lastAssistantReply: string;
  isCorrection: boolean;
  shouldAct: boolean;
  allOk: boolean;
  rescheduleAsk: boolean;
  aiUnavailable: boolean;
  archiveOutcome: TurnOutcome;
  archiveReason: string | null;
  pendingForArchive: { original_content?: string | null } | null;
  sparringActive: boolean;
  started: number;
  onboarding: OnboardingState;
  assessorName: string;
  userFirstName: string;
  nowLisbonYmd: string;
  nowLisbonHuman: string;
}

export async function runEngineTail(input: EngineTailInput): Promise<{ reply: string }> {
  const {
    supabase, ctx, userId, channel, sourceMessageId, trimmed, toolResults, decideR, thinkR,
  } = input;

  const prospectingActed =
    !!input.leadTool && input.leadTool.ok && !(input.leadTool.data as any)?.duplicate;

  const finalized = await finalizeReplyText({
    reply: input.reply,
    toolResults,
    cancelTool: input.cancelTool,
    decideAction: decideR.decision.action,
    shouldAct: input.shouldAct,
    allOk: input.allOk,
    prospectingActed,
    rescheduleAsk: input.rescheduleAsk,
    isCorrection: input.isCorrection,
    lastAssistantReply: input.lastAssistantReply,
    aiUnavailable: input.aiUnavailable,
    pendingAsks: input.pendingAsks,
  });
  let reply = finalized.reply;
  const executedOk = finalized.executedOk;

  // Itens por resolver: a resposta diz o que foi mesmo escrito E enumera
  // TODOS os que ficaram à espera. Nunca se escolhe um e calam-se os outros.
  const pendingAsks = input.pendingAsks ?? [];
  if (pendingAsks.length) {
    reply = composeAsksReply(describeWrites(toolResults as any), pendingAsks);
  }

  const archive = resolveArchiveOutcome({
    archiveOutcome: input.archiveOutcome,
    archiveReason: input.archiveReason,
    shouldAct: input.shouldAct,
    prospectingActed,
    aiUnavailable: input.aiUnavailable,
    reply,
    decideError: decideR.error ?? null,
    thinkError: thinkR.error ?? null,
  });

  // Em treino nada é arquivado: a simulação não pode deixar rasto em Diversos.
  if (!input.sparringActive) {
    reply = await applySafetyNet(ctx, {
      content: buildArchiveContent({
        trimmed,
        pendingContent: input.pendingForArchive?.original_content ?? null,
        recentRows: (input.recentRows as any[]) ?? [],
      }),
      outcome: archive.outcome,
      reason: archive.reason,
      reply,
    });
  }

  const totalLatencyMs = Date.now() - input.started;
  // Confirmação transparente: o quê + onde, sem prometer envios.
  reply = enforceTransparentConfirmation(reply, toolResults as any, {
    executedOk,
    pendingAsk: pendingAsks.length > 0,
  });
  const inputTokens = thinkR.usage.inputTokens + decideR.usage.inputTokens;
  const outputTokens = thinkR.usage.outputTokens + decideR.usage.outputTokens;
  const success = input.allOk && !decideR.error && !thinkR.error;

  const traceId: string | null = await recordEngineTurn(supabase, {
    userId,
    channel,
    sourceMessageId: sourceMessageId ?? null,
    inputContent: trimmed,
    observations: input.observations as unknown,
    hypotheses: thinkR.output.hypotheses as unknown,
    searches: input.searches as unknown,
    decision: decideR.decision as unknown,
    toolCalls: toolResults as any,
    memoryWrites: decideR.decision.memory_writes as unknown,
    reply,
    thinkLatencyMs: thinkR.latencyMs,
    decideLatencyMs: decideR.latencyMs,
    totalLatencyMs,
    inputTokens,
    outputTokens,
    success,
    error: (decideR.error ?? thinkR.error) ?? null,
    confidence: decideR.decision.confidence,
  });

  const aqsScore = await scoreQuality(supabase, {
    userId, channel, traceId, sourceMessageId: sourceMessageId ?? null,
    trimmed, reply, decision: decideR.decision, toolResults,
    recentRows: (input.recentRows as any[]) ?? [],
    lastAssistantReply: input.lastAssistantReply,
  });

  const correctionRecord = await captureTailCorrection(supabase, {
    isCorrection: input.isCorrection,
    userId, channel,
    lastAssistantReply: input.lastAssistantReply,
    trimmed,
  });

  const atsValue = await scoreTrust(supabase, {
    userId, channel, traceId,
    decision: decideR.decision,
    toolResults,
    searches: input.searches,
    historyPreview: input.historyPreview,
    trimmed, reply,
    aqsScore,
    hasCorrection: !!correctionRecord,
  });

  maybeReflect(supabase, {
    userId, traceId, aqsScore, atsValue, correctionRecord,
    trimmed, reply, decision: decideR.decision,
    observations: input.observations, searches: input.searches,
  });

  maybeShadow(supabase, {
    userId, channel, traceId, trimmed,
    observations: input.observations,
    hypotheses: thinkR.output.hypotheses,
    searches: input.searches,
    historyPreview: input.historyPreview,
    assessorName: input.assessorName,
    userFirstName: input.userFirstName,
    nowLisbonYmd: input.nowLisbonYmd,
    nowLisbonHuman: input.nowLisbonHuman,
    decision: decideR.decision,
    reply,
  });

  const onboardingOffer = await maybeOfferOnboarding(supabase, {
    userId, reply,
    onboarding: input.onboarding,
    assessorName: input.assessorName,
    sparringActive: input.sparringActive,
    decisionAction: decideR.decision.action,
    toolResults,
    hasPending: !!input.pendingForArchive,
  });
  reply = onboardingOffer.reply;

  let offeredProfileQuestion = false;
  if (!onboardingOffer.offered && !input.sparringActive) {
    const drip = await maybeOfferProfileDrip(supabase, {
      userId, channel, sourceMessageId: sourceMessageId ?? null,
      reply,
      decisionAction: decideR.decision.action,
      toolResults,
      hasPending: !!input.pendingForArchive,
      onboarding: input.onboarding,
    });
    reply = drip.reply;
    offeredProfileQuestion = drip.offered;
  }

  await maybeRecordOpenQuestion(supabase, {
    userId, channel, sourceMessageId: sourceMessageId ?? null,
    reply,
    decisionAction: decideR.decision.action,
    toolResults,
    hasPending: !!input.pendingForArchive,
    sparringActive: input.sparringActive,
    offeredProfileQuestion,
  });

  return { reply };
}

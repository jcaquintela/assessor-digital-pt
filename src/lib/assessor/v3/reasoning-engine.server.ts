// Reasoning Engine v3 — orquestrador central (OBSERVE → THINK → SEARCH → DECIDE → ACT).

import type { EngineInput, EngineOutcome } from "../engine.server";
import { observe } from "./observe.server";
import { think } from "./think.server";
import { search } from "./search.server";
import { decide } from "./decide.server";
import { executeToolCalls, applyMemoryWrites } from "./act.server";
import { isolateUnrelatedPending, stripInheritedMotive } from "../context-isolation";
import { sanitizeReply, enforceHumanTone, enforceSingleQuestion, NATURAL_FALLBACKS } from "../culture/sanitize";
import { computeQualitySignals, persistQualityScore } from "./quality.server";
import { runShadow, shouldRunShadow } from "./shadow.server";
import {
  computeATS, computeContextPreservation, computeSafeDecisions, computeTaskSuccess,
  persistTrustScore, type TrustSignals,
} from "./trust.server";
import { captureCorrection, looksLikeCorrection } from "./corrections.server";
import { suppressRejectedQuestion } from "./rejected-question";
import { reflect, type ReflectionTrigger } from "./reflection.server";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import { lisbonYmd } from "../lisbon-day";
import { blockedChannelReason } from "../channel-guard";
import type { DomainContext } from "../v2/domain.server";
import { TOOL_REGISTRY } from "../v2/domain.server";
import {
  findActivePendingAction,
  markPendingActionStatus,
  createPendingAction,
} from "../memory.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../culture/short-answers";
export { personChoiceIsNone } from "./pending-resolvers/agenda-person.server";
import { personChoiceIsNone } from "./pending-resolvers/agenda-person.server";

import {
  detectAgendaQuery,
  detectMiscQuery,
  detectDayStateQuery,
  composeDayStateReply,
  formatAgendaReply,
  detectAgendaDateQuery,
  formatAgendaDateReply,
  detectEventNameQuery,
  rankEventsByTitle,
  formatEventFoundReply,
  BARE_CONFIRMATION_REPLY,
  ACKNOWLEDGED_REPLY,
  isBareAcknowledgement,
  hasValidPendingContext,
  type AgendaItem,
} from "./deterministic.server";
import { applySafetyNet, buildArchiveContent, archiveToMiscellaneous } from "./safety-net.server";
import { isRegisterOnly, isAnswerablePending } from "../pending-answerable";
import { formatQueryResults, isQueryTool } from "./query-results";
import { detectContactReadQuery, detectReadRequest, READ_FAILED_REPLY } from "./read-intent";
import { resolveEllipticRead } from "./elliptic-read";
import { readLastRead, recordLastRead } from "./last-read.server";
import { isDiscardCommand } from "../culture/discard";
import { enforceTransparentConfirmation } from "./write-receipt";
import {
  detectCompletionInstructions,
  formatCompletionReply,
  recurrenceQuestion,
  remainingRequest,
  remainderNeedsWork,
  ambiguousCompletionQuestion,
  claimsCompletion,
  unverifiedCompletionReply,
} from "./completion-intent";
import { anchorFromBriefing, isEllipticCompletion } from "./briefing-anchor";

import {
  detectPersonBriefQuery,
  formatPersonBrief,
  personNotFoundReply,
  ambiguousPersonReply,
} from "./person-brief";
import { buildPersonBrief } from "./person-brief.server";
import { detectWhatsNewQuery, formatWhatsNewReply, noRecentUpdatesReply, NO_UPDATES_REPLY } from "./whats-new";
import { detectEllipticEntity, ellipticConfirmQuestion } from "./elliptic";
import { lastProductUpdate, listRecentProductUpdates } from "./whats-new.server";
import {
  detectFeedbackTarget,
  feedbackConfirmQuestion,
  feedbackClarifyQuestion,
  detectFeedbackAnnouncement,
  feedbackAskBody,
  isEmptyFeedbackBody,
  FEEDBACK_BODY_RETRY,
  readClarifyAnswer,
  FEEDBACK_CLARIFY_RETRY,
  FEEDBACK_NOT_PRODUCT_REPLY,
  FEEDBACK_CANCELLED_REPLY,
  FEEDBACK_FAILED_REPLY,
  feedbackSavedReply,
  type FeedbackKind,
} from "./feedback";
import { saveProductFeedback } from "./feedback.server";
import {
  appendOffer,
  GOALS_QUESTION,
  GOALS_SAVED_REPLY,
  NAME_KEPT_REPLY,
  NAME_QUESTION,
  NAME_SET_REPLY,
  nextOnboardingOffer,
  readGoalsAnswer,
  readNameAnswer,
  type OnboardingState,
} from "./onboarding";
import {
  loadOnboardingState,
  markOnboardingOffered,
  saveAssessorName,
  saveOnboardingGoals,
  setOnboardingStage,
} from "./onboarding.server";
import { validateAssessorName } from "../assessor-name";
import { logSparringSuppression } from "./sparring-audit.server";
import { assertNoSparringLeak } from "./sparring-assert.server";
import { logAiTurn, recordEngineTurn } from "./telemetry-repo.server";
import { runEngineTail } from "./engine-tail.server";
import { runDeterministicRouter } from "./deterministic-router.server";



import { HISTORY_LIMIT, nowLisbonHuman, nowLisbonYmd, toHistoryPreview } from "./engine-shared";
import { shapeExecutionOutcome, shapeAgendaAsks, shapeToolReplies } from "./post-act-reply.server";

// Padrão de linguagem de incompreensão. Usado (a) para nunca comunicar
// falha depois de uma execução bem sucedida e (b) para reclassificar o
// outcome apenas quando nada foi executado.
const NOT_UNDERSTOOD_RE = /n[ãa]o\s+(percebi|entendi|compreendi)|podes\s+explicar\s+de\s+outra\s+forma/i;
// Linguagem que afirma conclusão. Só pode sair depois de escrita real.
const CLAIMS_COMPLETION_RE =
  /\b(feito|combinado|tratado|resolvido|est[áa]\s+feito|j[áa]\s+est[áa]|desmarquei|desmarcado|cancelei|cancelado|apaguei|limpei|registei|guardei|marquei|actualizei|atualizei)\b/i;

import type { PendingResolver } from "./pending-resolvers/types";
import {
  suggestFileLinkPending,
  keepPhotoPending,
  bulkArchivePending,
} from "./pending-resolvers/drive-files.server";
import {
  collectingFeedbackPending,
  clarifyFeedbackTargetPending,
  recordProductFeedbackPending,
} from "./pending-resolvers/feedback.server";
import { financeCommissionShortcut } from "./pending-resolvers/finance-commission.server";
import {
  confirmEventPersonPending,
  rejectEventPersonPending,
  confirmEventReschedulePending,
} from "./pending-resolvers/agenda-person.server";
import {
  createProspectingLeadPending,
  createPersonEllipticPending,
  createDealPending,
} from "./pending-resolvers/create-entities.server";
import {
  AUDIO_PENDING_RESOLVERS,
  resolveAudioMediaSlot,
} from "./pending-resolvers/audio.server";
import { runSparringGuard } from "./sparring-runner.server";

// Tabela de despacho por intent. A ORDEM é comportamento: replica
// exactamente a cascata de `if` que existia no motor.
const INTENT_PENDING_RESOLVERS: PendingResolver[] = [
  confirmEventPersonPending,
  rejectEventPersonPending,
  confirmEventReschedulePending,
  createProspectingLeadPending,
  createPersonEllipticPending,
  createDealPending,
];

// Pendentes de baixo acoplamento (Drive, feedback) + atalho de comissão.
// A ORDEM desta lista é comportamento: mantém-se a mesma do código inline.
const LOW_COUPLING_PENDING_RESOLVERS: PendingResolver[] = [
  suggestFileLinkPending,
  keepPhotoPending,
  bulkArchivePending,
  collectingFeedbackPending,
  clarifyFeedbackTargetPending,
  recordProductFeedbackPending,
  financeCommissionShortcut,
];


// Os auxiliares de data/histórico vivem em `engine-shared.ts`.


/**
 * Reformular a MESMA pergunta não pode encurtar a janela de confirmação.
 *
 * Caso real (13/08): às 21:45 o Afonso pergunta se apaga os 9 áudios; às
 * 21:50, depois de "E documentos?", repete a pergunta por outras palavras. O
 * rascunho continuou a guardar o texto antigo, por isso a última pergunta do
 * assessor "não era" a do pendente e a janela caiu dos 24h para 3 minutos —
 * o "Sim" aos 23 minutos apanhou "já caducou".
 *
 * Solução: existe UM único relógio (o rascunho em pending_actions) e ele é
 * re-sincronizado sempre que o Afonso volta a perguntar. A pergunta relevante
 * mais recente passa a ser, de facto, a que conta para as 24h.
 */
async function syncPendingQuestion(
  supabase: any,
  userId: string,
  channel: string,
  reply: string,
): Promise<void> {
  const text = String(reply ?? "").trim();
  if (!text.includes("?")) return;
  const pending = await findActivePendingAction(supabase, userId, channel);
  const { shouldRefreshPendingQuestion } = await import("../pending-answerable");
  if (!shouldRefreshPendingQuestion(pending, text)) return;
  await supabase
    .from("pending_actions")
    .update({ current_question: text.slice(0, 2000), updated_at: new Date().toISOString() } as never)
    .eq("id", pending!.id);
}

// O turno de treino (sparring) vive em `sparring-runner.server.ts`.



export async function runReasoningEngine(
  input: EngineInput,
  opts?: { skipCompletionPass?: boolean },
): Promise<EngineOutcome> {
  const out = await runReasoningEngineInner(input, opts);
  try {
    if (input.userId) {
      await syncPendingQuestion(input.supabase, input.userId, input.channel, out.reply);
    }
  } catch { /* noop */ }
  return out;
}

async function runReasoningEngineInner(
  input: EngineInput,
  opts?: { skipCompletionPass?: boolean },
): Promise<EngineOutcome> {
  const started = Date.now();
  const { supabase, userId, channel, content, sourceMessageId } = input;
  if (!userId) return { reply: NATURAL_FALLBACKS.unassociated };
  // Isolamento de testes — ver `channel-guard.ts`. Repetido aqui porque o
  // motor v3 também é invocado directamente (scripts, testes, fast-paths).
  if (blockedChannelReason(channel)) return { reply: NATURAL_FALLBACKS.didNotUnderstand };
  const trimmed = content.trim();
  if (!trimmed) return { reply: NATURAL_FALLBACKS.didNotUnderstand };

  // Duas datas distintas na MESMA instrução ("dia 13 às 15 e depois tenho dia
  // 7 de setembro às 10") são dois compromissos, não um reagendamento.
  const { allowsSameTurnSiblings } = await import("./multi-date-turn");
  const ctx: DomainContext = {
    supabase, userId, channel,
    sourceMessageId: sourceMessageId ?? null,
    sameTurnSeparateDates: allowsSameTurnSiblings(trimmed),
  };

  // ── Modo treino (sparring) — PRIMEIRO GUARD DO TURNO ──
  //
  // Tem de ser lido antes de qualquer atalho determinístico (conclusões,
  // agenda, Drive) e antes do DECIDE/ACT: foi por os atalhos correrem antes
  // deste ponto que uma pesquisa real de imóveis disparou a partir de fala em
  // personagem. Em treino, o turno inteiro é tratado aqui e nada toca na base
  // de dados.
  {
    const sparred = await runSparringGuard({ supabase, userId, channel, trimmed });
    if (sparred) return sparred;
  }




  // ── Instruções de conclusão ("o estudo de mercado já está tratado") ──
  // Extraído para `completion-pass.server.ts` (Lote 8) — mesma ordem.
  if (!opts?.skipCompletionPass) {
    const completed = await runCompletionPass({
      ctx, supabase, userId, channel, trimmed,
      rerun: (content: string) => runReasoningEngine({ ...input, content }, { skipCompletionPass: true }),
    });
    if (completed) return completed;
  }


  const [{ data: prof }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("name, assessor_name").eq("id", userId).maybeSingle(),
    supabase
      .from("assessor_messages")
      .select("role, content, created_at, id")
      .eq("user_id", userId).eq("channel", channel)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  const assessorName = sanitizeAssessorName((prof as any)?.assessor_name ?? "") || ASSESSOR_NAME_DEFAULT;
  const userFirstName = String((prof as any)?.name ?? "").split(/\s+/)[0] || "";
  const historyPreview = toHistoryPreview((recentRows as any[]) ?? []);

  // Heurística de contexto conversacional aberto: se a última mensagem do
  // Assessor terminou em "?" e foi há menos de 10 minutos, uma resposta
  // curta ("sim", "ok") DEVE ser tratada como continuação da pergunta e
  // NUNCA como confirmação órfã. Sem isto, o Assessor responderia
  // "Claro. A que te referes?" mesmo quando acabou de perguntar algo.
  const lastAssistant0 = ((recentRows as any[]) ?? []).find((r) => r?.role === "assistant");
  const lastAssistantContent0 = String(lastAssistant0?.content ?? "").trim();
  const lastAssistantAt0 = lastAssistant0?.created_at ? new Date(lastAssistant0.created_at) : null;
  const lastAssistantAskedQuestion =
    /\?\s*$/.test(lastAssistantContent0) &&
    !!lastAssistantAt0 &&
    (Date.now() - lastAssistantAt0.getTime()) < 10 * 60_000;

  // Respostas curtas às perguntas proativas de documentação têm memória
  // própria. Sem isto, "sim"/"não" seguia para o motor geral e o mesmo
  // nudge voltava no dia seguinte apesar de já ter sido respondido.
  if (lastAssistantAskedQuestion && (saIsConfirmation(trimmed) || saIsRejection(trimmed))) {
    try {
      const { resolveLatestDocumentNudgeAnswer } = await import("./proactivity.server");
      const resolved = await resolveLatestDocumentNudgeAnswer(supabase, {
        userId,
        channel,
        answer: saIsConfirmation(trimmed) ? "yes" : "no",
        lastAssistantContent: lastAssistantContent0,
      });
      if (resolved.resolved && resolved.reply) return { reply: resolved.reply };
    } catch (error) {
      console.error("[v3] falha a registar resposta ao nudge documental", error);
    }
  }

  // ── Resposta a uma pergunta de perfil ("por gotas") ─────────────────
  try {
    const {
      findProfileQuestion, closeProfileQuestion, loadProfileDripState,
      saveProfileAnswer, registerProfileRefusal,
    } = await import("./profile-drip.server");
    const openProfile = await findProfileQuestion(supabase, { userId, channel });
    if (openProfile) {
      const { readProfileAnswer, WORK_AREA_SAVED_REPLY, TEAM_SAVED_REPLY } =
        await import("./profile-drip");
      const answer = readProfileAnswer(openProfile.key, trimmed);
      if (answer.kind === "value") {
        await saveProfileAnswer(supabase, userId, openProfile.key, answer.text);
        await closeProfileQuestion(supabase, openProfile.id, "executed");
        return {
          reply: openProfile.key === "work_area"
            ? WORK_AREA_SAVED_REPLY(answer.text)
            : TEAM_SAVED_REPLY,
        };
      }
      // Recusa ou trabalho real: fecha sem insistir.
      const state = await loadProfileDripState(supabase, userId);
      await registerProfileRefusal(supabase, userId, state);
      await closeProfileQuestion(supabase, openProfile.id, "cancelled");
    }
  } catch { /* noop */ }

  // ── Arranque leve (2 perguntas, nunca obrigatórias) ──────────────────

  let onboarding: OnboardingState = {
    stage: "not_started", offers: 0, lastOfferAt: null, goals: null,
  };
  try { onboarding = await loadOnboardingState(supabase, userId); } catch { /* noop */ }

  const askedName = /como preferes chamar-me/i.test(lastAssistantContent0);
  const askedGoals = /o que procuras mais em mim/i.test(lastAssistantContent0);

  if (onboarding.stage === "name_asked" && askedName) {
    const answer = readNameAnswer(trimmed);
    if (answer.kind === "rename") {
      const v = validateAssessorName(answer.name);
      if (v.ok) {
        try { await saveAssessorName(supabase, userId, v.value); } catch { /* noop */ }
        try { await markOnboardingOffered(supabase, userId, "goals_asked", onboarding.offers); } catch { /* noop */ }
        return { reply: `${NAME_SET_REPLY(v.value)} ${GOALS_QUESTION}` };
      }
    }
    if (answer.kind === "keep") {
      try { await markOnboardingOffered(supabase, userId, "goals_asked", onboarding.offers); } catch { /* noop */ }
      return { reply: `${NAME_KEPT_REPLY(assessorName)} ${GOALS_QUESTION}` };
    }
    // Ignorou ou trouxe trabalho real: cai fora sem insistir.
    try { await setOnboardingStage(supabase, userId, "skipped"); } catch { /* noop */ }
    onboarding = { ...onboarding, stage: "skipped" };
  } else if (onboarding.stage === "goals_asked" && askedGoals) {
    const answer = readGoalsAnswer(trimmed);
    if (answer.kind === "goals") {
      try { await saveOnboardingGoals(supabase, userId, answer.text); } catch { /* noop */ }
      return { reply: GOALS_SAVED_REPLY };
    }
    try { await setOnboardingStage(supabase, userId, "skipped"); } catch { /* noop */ }
    onboarding = { ...onboarding, stage: "skipped" };
  }

  // Contexto acumulado para a rede de segurança: guardar só "09:30" perde
  // o pedido real ("bloco de agenda amanhã para chamadas à rede").
  let pendingForArchive: { original_content?: string | null; intent?: string | null } | null = null;

  // Guião de abordagem a uma placa de particular: só responde a uma escolha
  // explícita ("chamada"/"mensagem"), para não roubar o "sim" ao lembrete.
  try {
    const { resolveScriptPending } = await import("@/lib/prospecting/script-offer.server");
    const scriptReply = await resolveScriptPending({ supabase, userId, channel }, trimmed);
    if (scriptReply) return { reply: scriptReply };
  } catch { /* noop */ }

  // Escolha de qual (ou quais) compromisso desmarcar. "As duas" desmarca as
  // duas — e a confirmação lista cada uma com o respectivo resultado.
  try {
    // Resposta à pergunta de recorrência ("queres que continue a repetir?").
    // Sem isto, a pergunta era feita e a resposta caía no vazio.
    const recPending = await findActivePendingAction(supabase, userId, channel, "recurrence");
    if (recPending && recPending.intent === "confirm_recurrence_continue") {
      const payload = (recPending.structured_payload ?? {}) as Record<string, any>;
      const routineId = payload.routine_id ? String(payload.routine_id) : null;
      const routineTitle = String(payload.routine_title ?? "");
      const { readRecurrenceAnswer, recurrenceKeptReply, recurrenceStoppedReply } =
        await import("./recurrence-answer");
      const answer = readRecurrenceAnswer(trimmed);
      if (answer === "stop" && routineId) {
        const res = await TOOL_REGISTRY.set_routine_active!(ctx, { routine_id: routineId, active: false });
        await markPendingActionStatus(supabase, recPending.id, res.ok ? "executed" : "failed", {
          error_message: res.ok ? null : (res.error ?? "not_updated"),
        });
        if (res.ok) return { reply: recurrenceStoppedReply(routineTitle) };
      } else if (answer === "continue") {
        await markPendingActionStatus(supabase, recPending.id, "executed");
        return { reply: recurrenceKeptReply(routineTitle) };
      }
    }

    const choicePending = await findActivePendingAction(supabase, userId, channel, "cancel");
    if (choicePending && choicePending.intent === "choosing_cancel_target") {
      const payload = (choicePending.structured_payload ?? {}) as Record<string, any>;
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const { pickCancelChoiceMulti, formatMultiCancelReply } = await import("./cancel-choice");
      let choiceText = trimmed;
      let chosen = pickCancelChoiceMulti(candidates as any[], choiceText);
      // Rajada: a escolha só cobre parte dos candidatos. Antes de fechar,
      // damos uma janela curta às mensagens que ainda vêm a caminho ("Ambas").
      if (chosen.length && chosen.length < candidates.length) {
        const { collectChoiceBurstFollowUps, markChoiceBurstConsumed } =
          await import("./choice-burst.server");
        const extra = await collectChoiceBurstFollowUps(supabase, {
          userId, channel, sourceMessageId: sourceMessageId ?? null,
        });
        if (extra.length) {
          choiceText = [choiceText, ...extra.map((e) => e.content)].join("\n");
          const merged = pickCancelChoiceMulti(candidates as any[], choiceText);
          if (merged.length > chosen.length) {
            chosen = merged;
            await markChoiceBurstConsumed(
              supabase, extra.map((e) => e.id), choicePending.id,
            );
          }
        }
      }
      if (chosen.length) {
        const exec = TOOL_REGISTRY.cancel_follow_up;
        const result = await exec(ctx, { follow_up_ids: chosen.map((c) => c.id) });
        const cancelledIds = new Set(
          (((result.data as any)?.items ?? []) as any[]).map((i) => String(i.id)),
        );
        const outcomes = chosen.map((item) => ({
          item,
          ok: !!result.ok && cancelledIds.has(String(item.id)),
        }));
        await markPendingActionStatus(
          supabase,
          choicePending.id,
          outcomes.some((o) => o.ok) ? "executed" : "failed",
          { error_message: result.ok ? null : (result.error ?? "not_cancelled") },
        );
        const { ensureAllPartsAnswered } = await import("./composite-request");
        return {
          reply: ensureAllPartsAnswered(
            formatMultiCancelReply(outcomes),
            String(choicePending.original_content ?? ""),
          ),
        };
      }
      if (saIsRejection(trimmed) || isDiscardCommand(trimmed)) {
        await markPendingActionStatus(supabase, choicePending.id, "cancelled");
        return { reply: "Certo — não desmarquei nada." };
      }
    }
  } catch { /* noop */ }

  // Fast-path prospeção — se existe uma proposta pendente de placa e o
  // consultor confirma/cancela, resolvemos sem passar por THINK/DECIDE.
  // Garante que o "Feito" só sai depois da persistência real.
  try {
    let pending = await findActivePendingAction(supabase, userId, channel);

    // Ranhura "media": a pergunta lateral "guardo o ficheiro ou descarto?".
    // Só é resolvida quando não há outro assunto principal em aberto, para
    // um "não" nunca cair no rascunho errado.
    if (!pending) {
      const media = await resolveAudioMediaSlot({ supabase, userId, channel, trimmed });
      if (media) return media;
    }


    // Um pendente antigo, cuja pergunta já não é a que está em aberto, não
    // pode ser resolvido por uma resposta destinada a outro assunto.
    if (
      pending &&
      !isAnswerablePending(pending, {
        lastAssistantContent: lastAssistantContent0,
        quotedText: input.quotedText ?? null,
      })
    ) {
      await markPendingActionStatus(supabase, pending.id, "expired", {
        error_message: "stale: pergunta já não estava em aberto",
      });
      // Uma resposta objetiva nunca cai no vazio: dizemos que caducou e
      // reperguntamos, em vez de responder "a que te referes?". Mas só quando
      // a pergunta era mesmo a última coisa dita pelo Afonso — se a conversa
      // já seguiu para outro assunto, um "ok" solto é conversa normal.
      const { pendingIsLastQuestion, quotedMatchesPending } = await import("../pending-answerable");
      const wasOnScreen =
        pendingIsLastQuestion(pending, lastAssistantContent0) ||
        quotedMatchesPending(pending, input.quotedText ?? null);
      if (wasOnScreen && (saIsConfirmation(trimmed) || saIsRejection(trimmed))) {
        const { expiredConfirmationReply, isDestructiveConfirmation } =
          await import("../expired-confirmation");
        const reply = expiredConfirmationReply(
          pending.current_question ?? pending.pending_question,
          {
            destructive: isDestructiveConfirmation(
              pending.intent,
              pending.structured_payload as Record<string, unknown>,
            ),
          },
        );
        pending = null;
        return { reply };
      }
      pending = null;
    }

    // Sem rascunho vivo, mas o consultor respondeu "sim"/"não": se houve uma
    // confirmação a caducar há pouco, assumimos que era essa e reperguntamos.
    if (!pending && !lastAssistantAskedQuestion && (saIsConfirmation(trimmed) || saIsRejection(trimmed))) {
      const { findRecentExpiredConfirmation } = await import("../memory.server");
      const stale = await findRecentExpiredConfirmation(supabase, userId, channel);
      const { pendingIsLastQuestion: staleOnScreen, quotedMatchesPending: staleQuoted } =
        await import("../pending-answerable");
      // Só reabrimos o assunto se a pergunta caducada ainda era a última coisa
      // dita, ou se o consultor citou mesmo essa mensagem.
      const staleRelevant =
        !!stale &&
        (staleOnScreen(stale, lastAssistantContent0) ||
          staleQuoted(stale, input.quotedText ?? null));
      if (stale && staleRelevant) {
        const { expiredConfirmationReply, isDestructiveConfirmation } =
          await import("../expired-confirmation");
        // Fecha o assunto: o aviso é dado uma vez, não a cada "sim" solto.
        await markPendingActionStatus(supabase, stale.id, "cancelled", {
          error_message: "confirmação caducada — avisado o consultor",
        });
        return {
          reply: expiredConfirmationReply(stale.current_question ?? stale.pending_question, {
            destructive: isDestructiveConfirmation(
              stale.intent,
              stale.structured_payload as Record<string, unknown>,
            ),
          }),
        };
      }
    }

    // "Só registar" / "sem lembrete": recusa explícita de agendar. Fecha já o
    // rascunho e guarda o assunto em Diversos, em vez de o deixar vivo.
    if (pending && isRegisterOnly(trimmed)) {
      const content = String(pending.original_content ?? "").trim() || trimmed;
      await markPendingActionStatus(supabase, pending.id, "cancelled", {
        error_message: "consultor pediu só registo, sem lembrete",
      });
      const saved = await archiveToMiscellaneous(ctx, content, "ficou só registado, sem lembrete");
      return {
        reply: saved
          ? "Certo — fica só registado, sem lembrete. Deixei em Diversos."
          : "Certo — fica só registado, sem lembrete.",
      };
    }

    pendingForArchive = pending ?? null;
    // Escolha de contacto: o consultor escolheu (por botão no painel ou por
    // texto no canal). A associação é determinística e é sempre confirmada
    // por palavras — nunca fica implícita.
    // ---------- Tabela de despacho por intent (ordem = precedência) ----------
    // A ordem desta lista replica exactamente a ordem dos `if` que existia
    // aqui: escolha de contacto → rejeição de contacto → duplicado/
    // reagendamento → placa → pessoa elíptica → negócio. Cada entrada devolve
    // `null` quando não trata o turno, tal como o `if` caía para o seguinte.
    {
      const pc = { ctx, supabase, userId, channel, trimmed, pending };
      for (const resolver of INTENT_PENDING_RESOLVERS) {
        const handled = await resolver(pc);
        if (handled) return handled;
      }
    }


    // ---------- Áudio (breakdown + temas) ----------
    // Mesma precedência de sempre: proposta por itens → proposta por temas.
    {
      const pc = { ctx, supabase, userId, channel, trimmed, pending };
      for (const resolver of AUDIO_PENDING_RESOLVERS) {
        const handled = await resolver(pc);
        if (handled) return handled;
      }
    }


    // ---------- Pendentes de baixo acoplamento + atalho de comissão ----------
    // Mesma ordem de sempre: Drive (ligação, foto, lote) → feedback → comissão.
    {
      const pc = { ctx, supabase, userId, channel, trimmed, pending };
      for (const resolver of LOW_COUPLING_PENDING_RESOLVERS) {
        const handled = await resolver(pc);
        if (handled) return handled;
      }
    }


    // ---------- Router determinístico ----------
    // Ordem = precedência. Cada caso vive em deterministic-router.server.ts.
    {
      const routed = await runDeterministicRouter({ ctx, supabase, userId, channel, trimmed, pending });
      if (routed) return routed;
    }

    // (b) Confirmação curta sem contexto pendente → pede referência.
    if (
      saIsConfirmation(trimmed) &&
      !hasValidPendingContext(pending) &&
      !lastAssistantAskedQuestion
    ) {
      // O Assessor acabou de afirmar algo ("Marcada a visita amanhã às 14:30.")
      // e o consultor responde "Ok": é reconhecimento, não uma confirmação
      // órfã. Perguntar "A que te referes?" aqui soa a software partido.
      const recentStatement =
        !!lastAssistantContent0 &&
        !/\?\s*$/.test(lastAssistantContent0) &&
        !!lastAssistantAt0 &&
        (Date.now() - lastAssistantAt0.getTime()) < 30 * 60_000;
      let reply =
        recentStatement && isBareAcknowledgement(trimmed)
          ? ACKNOWLEDGED_REPLY
          : BARE_CONFIRMATION_REPLY;
      // Rajada: o "não" da mensagem anterior fechou o pendente há 2s e este
      // "sim" ficou órfão. A pergunta passa a nomear o assunto — e fica
      // gravada como pergunta em aberto (caso "Casa Final B", 30/07).
      let openSubject: string | null = null;
      if (reply === BARE_CONFIRMATION_REPLY) {
        const { findJustClosedPending, subjectOfPending, orphanBurstReply } =
          await import("./open-question.server");
        const justClosed = await findJustClosedPending(supabase, { userId, channel });
        const subject = subjectOfPending(justClosed);
        const anchored = orphanBurstReply(subject);
        if (anchored) { reply = anchored; openSubject = subject; }
      }
      await logAiTurn(supabase, {
        userId, channel, intent: reply === ACKNOWLEDGED_REPLY ? "bare_acknowledgement" : "bare_confirmation_no_context", route: "v3-deterministic",
        latencyMs: 0, success: true, error: null,
        toolName: null, toolSuccess: null, fallbackUsed: false,
      });
      if (reply !== ACKNOWLEDGED_REPLY) {
        try {
          const { recordOpenQuestion } = await import("./open-question.server");
          await recordOpenQuestion(supabase, {
            userId, channel, question: reply, subject: openSubject,
            sourceMessageId: sourceMessageId ?? null, toolsExecuted: 0,
          });
        } catch { /* noop */ }
      }
      return { reply };
    }
  } catch { /* noop — cai no fluxo normal */ }

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
  const searchesRaw = await search(ctx, observations, recommended);
  // Contaminação de contexto: um pendente sobre outra entidade não pode
  // sequer chegar ao DECIDE, senão o "porquê" dele escorrega para o registo
  // novo (caso real: "Contacta o Nuno Castilho" a herdar "pedir a caderneta").
  const isolation = isolateUnrelatedPending(searchesRaw as any, trimmed);
  const searches = isolation.searches as typeof searchesRaw;

  // Modo Sparring — assert defensivo, NÃO uma 2ª máquina de estados.
  // A decisão de treino já foi tomada no arranque do turno (readSparringState
  // + resolveSparringTurn), que devolve sem chegar aqui. Se mesmo assim o
  // estado de treino aparecer, é anomalia: regista-se e continua a suprimir.
  const convState = (searches as any).conversation_state ?? null;
  const sparringActive = await assertNoSparringLeak({
    conversationState: convState,
    userId, channel, message: trimmed,
  });


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
    sparring: sparringActive,
    consultantGoals: onboarding.goals,
  });

  if (sparringActive) {
    // Auditoria antes de descartar: fica o que ia correr e a mensagem original.
    await logSparringSuppression({
      userId, channel, message: trimmed,
      toolCalls: decideR.decision.tool_calls,
      memoryWrites: decideR.decision.memory_writes?.length ?? 0,
      action: decideR.decision.action,
      reason: "sparring_leak",
      turns: 0, route: "v3",

    });
    decideR.decision.tool_calls = [];
    decideR.decision.memory_writes = [];
    if (decideR.decision.action === "act" || decideR.decision.action === "search_more") {
      decideR.decision.action = "acknowledge";
    }
  }

  // 5) ACT — só executa se DECIDE disse "act".
  // Pedido de leitura pura ("lista os contactos que tens meus"): nunca pode
  // entrar no caminho de escrita. Descartamos escritas e garantimos a
  // ferramenta de consulta correspondente.
  const readReq = detectReadRequest(trimmed);
  if (readReq.pure && !sparringActive) {
    decideR.decision.memory_writes = [];
    const reads = decideR.decision.tool_calls.filter((t) => isQueryTool(t.name));
    decideR.decision.tool_calls = reads.length
      ? reads
      : readReq.tool
        ? [{ name: readReq.tool, arguments: readReq.arguments }]
        : [];
    if (decideR.decision.tool_calls.length) decideR.decision.action = "act";
    else if (decideR.decision.action === "act") decideR.decision.action = "acknowledge";
  }
  const shouldAct = decideR.decision.action === "act" && decideR.decision.tool_calls.length > 0;
  // Guarda simétrica à do "executou e mesmo assim perguntou": decidiu agir mas
  // não indicou ferramenta nenhuma. Caso real: "Desmarca tudo." → action=act,
  // tool_calls=[], reply="Feito." e zero escritas na base de dados. Sem
  // ferramenta não houve acção — a resposta não pode afirmar conclusão.
  const actedWithoutTools =
    decideR.decision.action === "act" && decideR.decision.tool_calls.length === 0;
  if (isolation.isolated) {
    for (const tc of decideR.decision.tool_calls) {
      const a = tc.arguments as Record<string, unknown>;
      for (const field of ["title", "notes", "description", "summary", "message_preview"]) {
        if (typeof a?.[field] === "string") {
          a[field] = stripInheritedMotive(a[field] as string, {
            message: trimmed,
            pendingText: isolation.pendingText,
          });
        }
      }
    }
  }
  const toolResults = shouldAct ? await executeToolCalls(ctx, decideR.decision.tool_calls) : [];
  const allOk = toolResults.every((r) => r.ok);

  await applyMemoryWrites(ctx, decideR.decision.memory_writes);

  let reply = sanitizeReply(decideR.decision.natural_reply);
  if (isolation.isolated) {
    reply = stripInheritedMotive(reply, { message: trimmed, pendingText: isolation.pendingText });
  }
  // A IA esteve em baixo (créditos, rate limit, timeout, erro do provedor).
  // Isto NÃO é incompreensão: o consultor tem de perceber a diferença.
  const aiUnavailable = thinkR.unavailable === true || decideR.unavailable === true;

  // Pós-ACT (parte 1): resultado da execução e idempotência.
  const outcome = shapeExecutionOutcome({
    reply,
    toolResults: toolResults as any,
    shouldAct,
    allOk,
    actedWithoutTools,
    pureRead: readReq.pure,
    readFailedReply: READ_FAILED_REPLY,
  });
  reply = outcome.reply;
  let archiveOutcome: "executed_ok" | "tool_failed" | "not_understood" | "service_down" = outcome.archiveOutcome;
  let archiveReason: string | null = outcome.archiveReason;

  // Override natural para prospeção executada dentro do DECIDE (turno único).
  const leadTool = toolResults.find((t) => t.name === "create_prospecting_lead");

  // Pós-ACT (parte 2): perguntas de agenda (reagendamento, calendário).
  const agendaAsks = await shapeAgendaAsks({
    supabase, userId, channel,
    sourceMessageId: sourceMessageId ?? null,
    trimmed,
    reply,
    toolResults: toolResults as any,
  });
  reply = agendaAsks.reply;
  const rescheduleAsk = agendaAsks.rescheduleAsk;


  const personAsk = toolResults.find(
    (t) => t.name === "create_event" && t.ok
      && (t.data as any)?.needsPersonConfirmation === true,
  );
  if (personAsk) {
    const d = personAsk.data as any;
    let question: string;
    if (d.mode) {
      const { personResolutionQuestion } = await import("@/lib/people/resolve-person.server");
      question = personResolutionQuestion({
        status: d.mode, personId: null, name: d.personName ?? null,
        candidates: d.suggestions ?? [],
      });
    } else {
      const { askLinkPersonQuestion } = await import("@/lib/people/name-match");
      question = askLinkPersonQuestion(String(d.personName ?? ""), d.suggestions ?? []);
    }
    try {
      await createPendingAction(supabase, {
        userId, channel,
        intent: "confirm_event_person",
        originalContent: trimmed,
        payload: {
          personName: d.personName,
          mode: d.mode ?? null,
          suggestions: d.suggestions ?? [],
          candidate_ids: d.candidateIds ?? [],
          tool: "create_event",
          incoming: d.incoming,
        },
        currentQuestion: question,
        pendingQuestion: question,
        sourceMessageId: sourceMessageId ?? null,
      });
    } catch { /* noop */ }
    reply = question;
  }

  // Seguimento agendado por nome: a resolução acontece antes da escrita, por
  // isso aqui só falta fazer a pergunta certa para cada caso.
  const followUpPersonAsk = toolResults.find(
    (t) => t.name === "create_follow_up" && t.ok
      && (t.data as any)?.needsPersonConfirmation === true,
  );
  if (followUpPersonAsk) {
    const d = followUpPersonAsk.data as any;
    const { personResolutionQuestion } = await import("@/lib/people/resolve-person.server");
    const question = personResolutionQuestion({
      status: d.mode, personId: null, name: d.personName ?? null,
      candidates: d.suggestions ?? [],
    });
    try {
      await createPendingAction(supabase, {
        userId, channel,
        intent: "confirm_event_person",
        originalContent: trimmed,
        payload: {
          personName: d.personName,
          mode: d.mode,
          suggestions: d.suggestions ?? [],
          candidate_ids: d.candidateIds ?? [],
          tool: "create_follow_up",
          incoming: d.incoming,
        },
        currentQuestion: question,
        pendingQuestion: question,
        sourceMessageId: sourceMessageId ?? null,
      });
    } catch { /* noop */ }
    reply = question;
  }

  // Associar proprietário a um imóvel existente: mesma regra das outras
  // escritas — ou é inequívoco, ou perguntamos antes de gravar.
  const ownerPersonAsk = toolResults.find(
    (t) => t.name === "update_property" && t.ok
      && (t.data as any)?.needsPersonConfirmation === true,
  );
  if (ownerPersonAsk) {
    const d = ownerPersonAsk.data as any;
    const { personResolutionQuestion } = await import("@/lib/people/resolve-person.server");
    const question = personResolutionQuestion({
      status: d.mode, personId: null, name: d.personName ?? null,
      candidates: d.suggestions ?? [],
    });
    try {
      await createPendingAction(supabase, {
        userId, channel,
        intent: "confirm_event_person",
        originalContent: trimmed,
        payload: {
          personName: d.personName,
          mode: d.mode,
          suggestions: d.suggestions ?? [],
          candidate_ids: d.candidateIds ?? [],
          tool: "update_property",
          incoming: d.incoming,
        },
        currentQuestion: question,
        pendingQuestion: question,
        sourceMessageId: sourceMessageId ?? null,
      });
    } catch { /* noop */ }
    reply = question;
  }
  // Pós-ACT (parte 3): prospeção, desmarcação, conclusão e financeiro.
  const shaped = await shapeToolReplies({
    ctx, supabase, userId, channel, trimmed,
    reply,
    toolResults: toolResults as any,
    leadTool: leadTool as any,
    convState,
    decideR,
  });
  reply = shaped.reply;
  const cancelTool = shaped.cancelTool;

  // Cauda do turno (finalização, rede de segurança, métricas, ofertas):
  // extraída para engine-tail.server.ts sem alteração de ordem nem de lógica.
  return await runEngineTail({
    ctx,
    supabase,
    userId,
    channel,
    sourceMessageId: sourceMessageId ?? null,
    trimmed,
    reply,
    toolResults: toolResults as any,
    cancelTool,
    leadTool: leadTool as any,
    decideR,
    thinkR,
    observations,
    searches,
    historyPreview,
    recentRows: (recentRows as any[]) ?? [],
    lastAssistantReply,
    isCorrection,
    shouldAct,
    allOk,
    rescheduleAsk: !!rescheduleAsk,
    aiUnavailable,
    archiveOutcome,
    archiveReason,
    pendingForArchive: pendingForArchive as any,
    sparringActive,
    started,
    onboarding,
    assessorName,
    userFirstName,
    nowLisbonYmd: nowLisbonYmd(),
    nowLisbonHuman: nowLisbonHuman(),
  });
}

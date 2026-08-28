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
  isDiscardAudioRequest,
  UNDO_KEEP_WINDOW_MS,
  UNDO_KEEP_TOO_LATE_REPLY,
} from "./audio-undo";
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
import {
  SPARRING_CONTINUE_QUESTION,
  SPARRING_PAUSED_TOPIC,
  SPARRING_TOPIC,

} from "./sparring";
import { resolveSparringTurn, type SparringTurn } from "./sparring-turn";
import { readSparringState, setSparringTopic, stopSparring } from "./sparring-state.server";
import { logSparringSuppression } from "./sparring-audit.server";
import { assertNoSparringLeak } from "./sparring-assert.server";
import { logAiTurn, recordEngineTurn } from "./telemetry-repo.server";
import { runEngineTail } from "./engine-tail.server";
import { runDeterministicRouter } from "./deterministic-router.server";



const HISTORY_LIMIT = 6;

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


function nowLisbonHuman(): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}
function nowLisbonYmd(): string {
  return lisbonYmd(new Date());
}
function toHistoryPreview(rows: Array<{ role: string; content: string }>): string {
  return [...rows].reverse()
    .filter((r) => r?.content && (r.role === "user" || r.role === "assistant"))
    .slice(-HISTORY_LIMIT)
    .map((r) => `${r.role === "user" ? "consultor" : "assessor"}: ${r.content}`)
    .join("\n");
}

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

/**
 * Turno em modo treino. Nenhuma ferramenta real corre aqui: só o DECIDE com o
 * bloco de sparring, para responder em personagem. Nada é arquivado nem
 * escrito na base de dados.
 */
async function runSparringTurn(args: {
  supabase: EngineInput["supabase"];
  userId: string;
  channel: string;
  trimmed: string;
  turn: SparringTurn;
}): Promise<EngineOutcome> {
  const { supabase, userId, channel, trimmed, turn } = args;
  const started = Date.now();
  const closing = turn.ending || turn.autoPause;

  await setSparringTopic(
    supabase as never,
    userId,
    channel,
    turn.ending ? null : turn.autoPause ? SPARRING_PAUSED_TOPIC : SPARRING_TOPIC,
    closing ? 0 : turn.turns,
  );

  // Auditoria: início e fim do treino ficam visíveis nas ações autónomas.
  if (turn.startedNow || closing) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rows: any[] = [];
      if (turn.startedNow) {
        rows.push({
          admin_user_id: null, action: "sparring_started", target_user_id: userId,
          resource_type: "conversation", resource_id: channel,
          reason: "Modo treino (sparring) iniciado — escrita bloqueada.",
          metadata: { channel, resumed: turn.resumed, source: "reasoning-engine-v3" },
        });
      }
      if (closing) {
        rows.push({
          admin_user_id: null, action: "sparring_ended", target_user_id: userId,
          resource_type: "conversation", resource_id: channel,
          reason: turn.autoPause
            ? "Modo treino em pausa automática após várias trocas."
            : "Modo treino terminado pelo consultor.",
          metadata: { channel, turns: turn.turns, auto: turn.autoPause, source: "reasoning-engine-v3" },
        });
      }
      await supabaseAdmin.from("admin_audit_logs").insert(rows as never);
    } catch { /* noop */ }
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

  const decideR = await decide({
    content: trimmed,
    observations: [],
    hypotheses: [],
    searches: {},
    historyPreview: toHistoryPreview((recentRows as any[]) ?? []),
    assessorName:
      sanitizeAssessorName((prof as any)?.assessor_name ?? "") || ASSESSOR_NAME_DEFAULT,
    userFirstName: String((prof as any)?.name ?? "").split(/\s+/)[0] || "",
    nowLisbonYmd: nowLisbonYmd(),
    nowLisbonHuman: nowLisbonHuman(),
    sparring: true,
  });

  // Guard duro: mesmo que o modelo devolva ferramentas ou memórias, morrem aqui.
  // Fica registo do que foi bloqueado, com a mensagem original do consultor.
  await logSparringSuppression({
    userId, channel, message: trimmed,
    toolCalls: decideR.decision.tool_calls,
    memoryWrites: decideR.decision.memory_writes?.length ?? 0,
    action: decideR.decision.action,
    reason: turn.ending
      ? "sparring_ending"
      : turn.autoPause
        ? "sparring_paused"
        : turn.startedNow
          ? "sparring_starting"
          : "sparring_active",
    turns: turn.turns, route: "v3-sparring",
  });
  decideR.decision.tool_calls = [];
  decideR.decision.memory_writes = [];

  let reply = sanitizeReply(decideR.decision.natural_reply);
  if (!reply) reply = NATURAL_FALLBACKS.aiDown;
  if (turn.autoPause && !reply.includes("continuar o treino")) {
    reply = `${reply}\n\n${SPARRING_CONTINUE_QUESTION}`.trim();
  }

  await logAiTurn(supabase, {
    userId, channel, intent: "sparring_turn", route: "v3-sparring",
    inputTokens: decideR.usage?.inputTokens ?? 0,
    outputTokens: decideR.usage?.outputTokens ?? 0,
    latencyMs: Date.now() - started, success: decideR.ok,
    error: decideR.error ?? null, fallbackUsed: !decideR.ok,
  });

  return { reply };
}


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
    const state = await readSparringState(supabase as never, userId, channel);
    const turn = resolveSparringTurn({ state, text: trimmed });
    if (turn.handleAsSparring) {
      return await runSparringTurn({ supabase, userId, channel, trimmed, turn });
    }
    if (turn.stale || (turn.wasPaused && !turn.resumed)) {
      // Nunca fica preso: treino esquecido ou pausa não retomada limpa o estado.
      try { await stopSparring(supabase as never, userId, channel); } catch { /* noop */ }
    }
  }



  // ── Instruções de conclusão ("o estudo de mercado já está tratado") ──
  //
  // Cada instrução de uma mensagem composta vive por si: uma ambiguidade
  // noutra parte (que compromisso desmarcar) nunca pode deixar esta por
  // processar — foi assim que um estudo de mercado dado como feito voltou a
  // aparecer nos briefings dias depois.
  if (!opts?.skipCompletionPass) {
    const done = detectCompletionInstructions(trimmed);
    let handledAny = false;
    if (done.length) {
      const lines: string[] = [];
      const handled: typeof done = [];
      let recurringAsk: { id: string; title: string } | null = null;
      let ambiguousAsk: string | null = null;
      for (const instruction of done) {
        try {
          const res = await TOOL_REGISTRY.complete_follow_up!(ctx, {
            subject_hint: instruction.subjectHint,
          });
          const d = (res.data ?? {}) as any;
          // Ambíguo NÃO pode seguir em silêncio: o caminho do modelo já
          // confirmou conclusões que nunca chegaram a ser escritas (20/08).
          if (res.ok && d?.ambiguous) {
            handled.push(instruction);
            if (!ambiguousAsk) ambiguousAsk = ambiguousCompletionQuestion(d.candidates ?? []);
            continue;
          }
          if (!res.ok) continue;
          handled.push(instruction);
          lines.push(formatCompletionReply(d.items ?? [], instruction.subjectHint));
          if (d?.recurring?.title && !recurringAsk) {
            recurringAsk = { id: String(d.recurring.id), title: String(d.recurring.title) };
            lines.push(recurrenceQuestion(d.recurring.title));
          }
        } catch { /* noop */ }
      }
      if (ambiguousAsk) return { reply: [lines.join(" "), ambiguousAsk].filter(Boolean).join(" ").trim() };
      if (handled.length) {
        handledAny = true;
        // A pergunta fica em memória na sua ranhura: o "sim"/"não" que vier a
        // seguir decide mesmo a recorrência, em vez de se perder.
        if (recurringAsk) {
          try {
            await createPendingAction(supabase, {
              userId, channel,
              intent: "confirm_recurrence_continue",
              originalContent: trimmed,
              payload: { routine_id: recurringAsk.id, routine_title: recurringAsk.title },
              pendingQuestion: recurrenceQuestion(recurringAsk.title),
              currentQuestion: recurrenceQuestion(recurringAsk.title),
            });
          } catch { /* noop */ }
        }
        const rest = remainingRequest(trimmed, handled);
        if (remainderNeedsWork(rest)) {
          const out = await runReasoningEngine({ ...input, content: rest }, { skipCompletionPass: true });
          return { ...out, reply: [lines.join(" "), out.reply].filter(Boolean).join(" ").trim() };
        }
        return { reply: lines.join(" ") };
      }
    }

    // Confirmação elíptica ancorada ao briefing: "Já está concluída", "Podes
    // dar como concluída" logo a seguir a um "Bom dia" com UM único item.
    if (!handledAny && isEllipticCompletion(trimmed)) {
      try {
        const { data: lastMsgs } = await supabase
          .from("assessor_messages")
          .select("content, message_type, created_at")
          .eq("user_id", userId).eq("channel", channel).eq("role", "assistant")
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(1);
        const anchor = anchorFromBriefing(((lastMsgs as any[]) ?? [])[0] ?? null);
        if (anchor) {
          const res = await TOOL_REGISTRY.complete_follow_up!(ctx, {
            subject_hint: anchor.subjectHint,
          });
          const d = (res.data ?? {}) as any;
          if (res.ok && d?.ambiguous) {
            return { reply: ambiguousCompletionQuestion(d.candidates ?? []) };
          }
          if (res.ok && (d?.items ?? []).length) {
            const out = [formatCompletionReply(d.items)];
            if (d?.recurring?.title) out.push(recurrenceQuestion(String(d.recurring.title)));
            return { reply: out.join(" ") };
          }
        }
      } catch { /* segue o caminho normal */ }
    }


    // Rede de segurança para a confirmação escrita que não nomeia assunto
    // ("já tratei disso", "fica sem efeito", "não atendeu"): fecha o
    // seguimento de que o Afonso falou há pouco. Vivia num atalho próprio no
    // gateway de canais, que cortava a mensagem antes do passe multi-item.
    if (!handledAny) {
      const { detectOutcomeFromText } = await import("@/lib/assessor/outcome-intent");
      const detected = detectOutcomeFromText(trimmed);
      if (detected) {
        const { resolveOutcomeTargetFromText, applyFollowUpOutcome, outcomeAck } =
          await import("@/lib/assessor/proactive/outcomes.server");
        const { askWhichTarget } = await import("@/lib/assessor/outcome-target");
        const decision = await resolveOutcomeTargetFromText(supabase, userId, trimmed);
        if (decision.kind === "apply") {
          const r = await applyFollowUpOutcome(supabase, userId, decision.target.id, detected);
          if (r.ok) return { reply: outcomeAck(detected, r.title) };
        } else if (decision.kind === "ask") {
          return { reply: askWhichTarget(decision.options) };
        }
      }
    }
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
      const mediaPending = await findActivePendingAction(supabase, userId, channel, "media");
      if (mediaPending && mediaPending.intent === "confirm_keep_audio") {
        const payload = (mediaPending.structured_payload ?? {}) as Record<string, any>;
        const fileId = payload.file_id ? String(payload.file_id) : null;
        const { discardAudioFile, keepAudioFile } = await import("./audio-keep.server");
        if (saIsConfirmation(trimmed)) {
          if (fileId) await keepAudioFile(supabase, fileId, userId);
          await markPendingActionStatus(supabase, mediaPending.id, "executed", {
            created_resource_type: "uploaded_file",
            created_resource_id: fileId,
          });
          return { reply: "Guardei o áudio no Drive Inteligente." };
        }
        if (saIsRejection(trimmed) || isDiscardCommand(trimmed)) {
          if (fileId) await discardAudioFile(supabase, fileId, userId);
          await markPendingActionStatus(supabase, mediaPending.id, "cancelled");
          // Descartar é descartar: sai o ficheiro E tudo o que dele saiu.
          const { discardLastInput } = await import("./discard.server");
          const { DISCARD_DONE_REPLY } = await import("../culture/discard");
          await discardLastInput(supabase, userId, channel);
          return { reply: DISCARD_DONE_REPLY };
        }
      }

      // "Descarta" dito DEPOIS de já ter confirmado o guardar: ou desfazemos
      // mesmo, ou dizemos claramente que o ficheiro ficou guardado e como
      // removê-lo. Nunca "fica sem efeito" sem dizer que efeito.
      if (!mediaPending && isDiscardAudioRequest(trimmed)) {
        const { findRecentlyKeptAudio } = await import("./audio-keep.server");
        const { discardLastInput } = await import("./discard.server");
        const { DISCARD_DONE_REPLY } = await import("../culture/discard");
        const kept = await findRecentlyKeptAudio(supabase, userId, channel, UNDO_KEEP_WINDOW_MS);
        if (kept) {
          await discardLastInput(supabase, userId, channel);
          return { reply: DISCARD_DONE_REPLY };
        }
        const older = await findRecentlyKeptAudio(supabase, userId, channel, 7 * 24 * 60 * 60 * 1000);
        if (older) return { reply: UNDO_KEEP_TOO_LATE_REPLY };
      }
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
  let archiveOutcome: "executed_ok" | "tool_failed" | "not_understood" | "service_down" = "executed_ok";
  let archiveReason: string | null = null;
  // A IA esteve em baixo (créditos, rate limit, timeout, erro do provedor).
  // Isto NÃO é incompreensão: o consultor tem de perceber a diferença.
  const aiUnavailable = thinkR.unavailable === true || decideR.unavailable === true;
  // Executou e mesmo assim perguntou ("Marco a ação ... ?") — a pergunta faz o
  // consultor responder "Sim" e o turno seguinte volta a executar o mesmo.
  // Se a acção já foi feita, a resposta tem de ser afirmativa, nunca uma
  // proposta.
  if (shouldAct && allOk && /\?\s*$/.test(reply)) {
    reply = "Feito.";
  }
  if (shouldAct && !allOk) {
    archiveOutcome = "tool_failed";
    archiveReason = toolResults.filter((r) => !r.ok)
      .map((r) => `${r.name}:${r.error ?? "unknown"}`).join("; ") || "tool_failed";
    reply = readReq.pure
      ? READ_FAILED_REPLY
      : "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?";
  }
  if (actedWithoutTools && !readReq.pure) {
    archiveOutcome = "not_understood";
    // Motivo interno: sem capacidade. O texto visível vem do formatter PT.
    archiveReason = "no_tool";
    if (!reply || CLAIMS_COMPLETION_RE.test(reply)) {
      reply = "Não cheguei a mexer em nada. Diz-me exactamente o que queres que faça?";
    }
  }

  // Idempotência: se `create_follow_up`/`create_event` devolveu um recurso
  // pré-existente para a mesma pending_action, respondemos de forma explícita
  // em vez de fingir que criámos algo novo.
  const idemHit = toolResults.find(
    (t) => (t.name === "create_follow_up" || t.name === "create_event")
      && t.ok && (t.data as any)?.idempotent === true,
  );
  if (idemHit) {
    const d = idemHit.data as any;
    if (d?.typeCorrected) {
      reply = d?.rescheduled
        ? "Já tinhas isso como lembrete, não como compromisso. Corrigi e passei para o novo horário — já aparece na agenda."
        : "Já tinhas isso como lembrete, não como compromisso. Corrigi — já aparece na agenda.";
    } else {
      reply = d?.rescheduled
        ? "Já tinhas esse seguimento. Passei-o para o novo horário."
        : "Já estava registado.";
    }
  }

  // Override natural para prospeção executada dentro do DECIDE (turno único).
  const leadTool = toolResults.find((t) => t.name === "create_prospecting_lead");

  // Compromisso provavelmente já existente com outra hora: perguntar sempre,
  // nunca duplicar em silêncio (caso real da consulta às 09:00 → 10:30).
  const rescheduleAsk = toolResults.find(
    (t) => t.name === "create_event" && t.ok
      && (t.data as any)?.needsRescheduleConfirmation === true,
  );
  if (rescheduleAsk) {
    const d = rescheduleAsk.data as any;
    const { rescheduleQuestion } = await import("../event-subject");
    const question = rescheduleQuestion(d.candidate, d.incoming);
    try {
      await createPendingAction(supabase, {
        userId, channel,
        intent: "confirm_event_reschedule",
        originalContent: trimmed,
        payload: { candidate: d.candidate, incoming: d.incoming },
        currentQuestion: question,
        pendingQuestion: question,
        sourceMessageId: sourceMessageId ?? null,
      });
    } catch { /* noop */ }
    reply = question;
  }

  // Compromisso agendado por nome sem contacto na base: perguntar antes de
  // gravar, para o evento nunca ficar "solto" com um nome só em texto.
  const calendarChoiceAsk = toolResults.find(
    (t) => t.name === "create_event" && t.ok
      && (t.data as any)?.needsCalendarProviderChoice === true,
  );
  if (calendarChoiceAsk) {
    const { CALENDAR_PROVIDER_CHOICE_REPLY } = await import("@/lib/providers/active");
    reply = CALENDAR_PROVIDER_CHOICE_REPLY;
  }

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
  if (leadTool) {
    const dup = (leadTool.data as any)?.duplicate === true;
    const leadId = (leadTool.data as any)?.lead?.id ?? (leadTool.data as any)?.existing?.id ?? null;
    if (leadTool.ok && !dup) {
      reply = "Feito. Registei a placa para contactares. Queres que te lembre de ligar?";
      if (leadId) {
        try {
          await supabase.from("conversation_states").upsert({
            user_id: userId, channel, external_conversation_id: channel,
            last_entity_type: "prospecting_lead",
            last_entity_id: leadId,
            last_intent: "create_prospecting_lead",
          } as never, { onConflict: "user_id,channel,external_conversation_id" });
        } catch { /* noop */ }
      }
      {
        const { appendScriptOffer } = await import("@/lib/prospecting/script-offer.server");
        reply = await appendScriptOffer(
          { supabase, userId, channel },
          {
            reply,
            leadId,
            payload: (((leadTool.data as any)?.lead ?? {}) as Record<string, any>),
            originalContent: trimmed,
          },
        );
      }
    } else if (leadTool.ok && dup) {
      reply = "Já tens uma placa registada com esse número. É a mesma?";
    }
  }

  // Desmarcações: a frase é construída a partir do que foi mesmo escrito na
  // base de dados. Zero linhas afectadas → nunca "Feito.".
  const cancelTool = toolResults.find((t) => t.name === "cancel_follow_up" && t.ok);
  if (cancelTool) {
    const d = (cancelTool.data ?? {}) as any;
    const { formatCancelReply, ambiguousCancelReply } = await import("./cancel-agenda");
    reply = d?.ambiguous
      ? ambiguousCancelReply(d.candidates ?? [])
      : formatCancelReply(d.items ?? [], d.period_label ?? null);
    // A pergunta de desambiguação guarda os candidatos na sua ranhura: a
    // resposta ("as duas", "a primeira") passa a ser resolvida de forma
    // determinística, sem depender do modelo escolher os ids certos.
    if (d?.ambiguous && Array.isArray(d.candidates) && d.candidates.length > 1) {
      try {
        await createPendingAction(supabase, {
          userId, channel,
          intent: "choosing_cancel_target",
          originalContent: trimmed,
          payload: {
            candidates: d.candidates.map((c: any) => ({
              id: c.id, title: c.title ?? null, due_time: c.due_time ?? null,
            })),
          },
          pendingQuestion: reply,
          currentQuestion: reply,
        });
      } catch { /* noop */ }
    } else if (!d?.ambiguous) {
      const { ensureAllPartsAnswered } = await import("./composite-request");
      reply = ensureAllPartsAnswered(reply, trimmed);
    }
  }

  // Conclusão feita pelo caminho do modelo: se o assunto se repete, a
  // pergunta de recorrência é feita na mesma e fica em memória à espera de
  // resposta — desligar a repetição nunca é decisão nossa.
  const completeTool = toolResults.find((t) => t.name === "complete_follow_up" && t.ok);
  if (completeTool) {
    const d = (completeTool.data ?? {}) as any;
    const rec = d?.recurring;
    if (!d?.ambiguous && rec?.id && rec?.title) {
      const question = recurrenceQuestion(String(rec.title));
      if (!reply.includes(question)) reply = [reply, question].filter(Boolean).join(" ").trim();
      try {
        await createPendingAction(supabase, {
          userId, channel,
          intent: "confirm_recurrence_continue",
          originalContent: trimmed,
          payload: { routine_id: String(rec.id), routine_title: String(rec.title) },
          pendingQuestion: question,
          currentQuestion: question,
        });
      } catch { /* noop */ }
    }
  }

  // Falsa confirmação positiva (caso real 20/08): o modelo escreveu "Dei o
  // lembrete da marcação das unhas como concluído" sem nenhuma escrita na
  // base de dados. Confirmar conclusão exige um fecho verificado.
  if (claimsCompletion(reply)) {
    const wrote = toolResults.some(
      (t) => t.name === "complete_follow_up" && t.ok && (((t.data as any)?.items ?? []).length > 0),
    );
    if (!wrote) reply = unverifiedCompletionReply();
  }


  // Ajustes culturais finais: sem "Feito" pré-execução, sem vocabulário
  // Financeiro: duplicado do mesmo dia — pergunta antes de assumir novo registo.
  // Dinheiro registado sem negócio: é aqui que o ciclo se fechava sozinho no
  // vazio. O Afonso propõe abrir o negócio que une pessoa, imóvel e comissão.
  const finOk = toolResults.find(
    (t) => t.name === "create_financial_movement" && t.ok && !(t.data as any)?.duplicate,
  );
  if (finOk) {
    try {
      const mv = (finOk.data as any)?.movement ?? {};
      const finArgs = (decideR.decision.tool_calls.find(
        (t) => t.name === "create_financial_movement",
      )?.arguments ?? {}) as Record<string, any>;
      const hasDeal = !!(mv.opportunity_id ?? (finOk.data as any)?.opportunity_id);
      let propertyId: string | null = finArgs.property_id ?? null;
      let personId: string | null = (convState as any)?.active_person_id ?? null;

      // O imóvel pode existir só nas palavras ("comissão do terreno"). Nesse
      // caso procuramos o registo que corresponde à descrição e as visitas
      // que falam do mesmo imóvel — é isso que revela o processo comercial.
      const { extractPropertyHint } = await import("@/lib/deals/property-hint");
      const hint = extractPropertyHint(
        `${trimmed} ${String(finArgs.property_reference ?? "")} ${String(finArgs.description ?? "")}`,
      );
      let visitHits: Array<{ personId: string | null; propertyId: string | null }> = [];
      if (hint) {
        const { findPropertyByHint, findVisitsForHint } = await import("@/lib/deals/property-hint.server");
        if (!propertyId) {
          const found = await findPropertyByHint(supabase, userId, hint);
          if (found) propertyId = found.id;
        }
        visitHits = await findVisitsForHint(supabase, userId, hint);
        if (!propertyId) propertyId = visitHits.find((v) => v.propertyId)?.propertyId ?? null;
        if (!personId) personId = visitHits.find((v) => v.personId)?.personId ?? null;
      }

      if (!hasDeal && (propertyId || personId || hint)) {
        const label = String(finArgs.opportunity_title ?? finArgs.description ?? "").trim();
        const { dealTitleFromHint } = await import("@/lib/deals/property-hint");
        const title = label.length > 3
          ? label.slice(0, 120)
          : hint ? dealTitleFromHint(hint) : "Novo negócio";
        const { createPendingAction: createPending } = await import("../memory.server");
        await createPending(supabase, {
          userId, channel, intent: "create_deal",
          originalContent: trimmed,
          payload: {
            title,
            kind: "venda",
            person_id: personId,
            property_id: propertyId,
            property_hint: !propertyId && hint ? hint.label : null,
            value: Number(finArgs.deal_value ?? 0) || 0,
            link_movement_ids: mv.id ? [mv.id] : [],
          } as Record<string, unknown>,
          sourceMessageId: ctx.sourceMessageId ?? null,
        });
        const visitNote = visitHits.length
          ? ` Já tinhas ${visitHits.length === 1 ? "uma visita" : `${visitHits.length} visitas`} ao mesmo ${hint?.label ?? "imóvel"}.`
          : "";
        const propNote = !propertyId && hint ? ` Crio também a ficha do ${hint.label}.` : "";
        reply = `${reply}${visitNote} Isto ainda não está ligado a nenhum negócio.${propNote} Queres que abra "${title}" para juntar tudo?`.trim();
      }
    } catch { /* a sugestão nunca pode estragar o registo */ }
  }

  const finTool = toolResults.find((t) => t.name === "create_financial_movement");
  if (finTool?.ok && (finTool.data as any)?.duplicate === true) {
    const existing = (finTool.data as any)?.existing ?? {};
    const kind = existing.type === "expense" ? "despesa" : "comissão";
    reply = `Já tinha uma ${kind} desse valor registada hoje. É a mesma ou queres registar outra?`;
  }

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

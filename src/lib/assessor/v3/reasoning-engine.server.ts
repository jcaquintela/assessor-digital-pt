// Reasoning Engine v3 — orquestrador central (OBSERVE → THINK → SEARCH → DECIDE → ACT).

import type { EngineInput, EngineOutcome } from "../engine.server";
import { observe } from "./observe.server";
import { think } from "./think.server";
import { search } from "./search.server";
import { decide } from "./decide.server";
import { executeToolCalls, applyMemoryWrites } from "./act.server";
import { sanitizeReply, enforceHumanTone, enforceSingleQuestion, NATURAL_FALLBACKS } from "../culture/sanitize";
import { computeQualitySignals, persistQualityScore } from "./quality.server";
import { runShadow, shouldRunShadow } from "./shadow.server";
import {
  computeATS, computeContextPreservation, computeSafeDecisions, computeTaskSuccess,
  persistTrustScore, type TrustSignals,
} from "./trust.server";
import { captureCorrection, looksLikeCorrection } from "./corrections.server";
import { reflect, type ReflectionTrigger } from "./reflection.server";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import { blockedChannelReason } from "../channel-guard";
import type { DomainContext } from "../v2/domain.server";
import { TOOL_REGISTRY } from "../v2/domain.server";
import {
  findActivePendingAction,
  markPendingActionStatus,
} from "../memory.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../culture/short-answers";
import {
  detectAgendaQuery,
  detectMiscQuery,
  formatAgendaReply,
  BARE_CONFIRMATION_REPLY,
  ACKNOWLEDGED_REPLY,
  isBareAcknowledgement,
  hasValidPendingContext,
  type AgendaItem,
} from "./deterministic.server";
import { applySafetyNet, buildArchiveContent, archiveToMiscellaneous } from "./safety-net.server";
import { isRegisterOnly, isAnswerablePending } from "../pending-answerable";
import { formatQueryResults, isQueryTool } from "./query-results";
import { detectReadRequest, READ_FAILED_REPLY } from "./read-intent";
import {
  isDiscardAudioRequest,
  UNDO_KEEP_WINDOW_MS,
  UNDO_KEEP_DONE_REPLY,
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
  FEEDBACK_SAVED_REPLY,
  FEEDBACK_SAVED_WITH_ATTACHMENT_REPLY,
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
  detectSparringContinue,
  detectSparringEnd,
  detectSparringStart,
  isSparringActive,
  isSparringPaused,
  sparringTurns,
  SPARRING_CONTINUE_QUESTION,
  SPARRING_MAX_TURNS,
  SPARRING_PAUSED_TOPIC,
  SPARRING_TOPIC,
} from "./sparring";

const HISTORY_LIMIT = 6;

// Padrão de linguagem de incompreensão. Usado (a) para nunca comunicar
// falha depois de uma execução bem sucedida e (b) para reclassificar o
// outcome apenas quando nada foi executado.
const NOT_UNDERSTOOD_RE = /n[ãa]o\s+(percebi|entendi|compreendi)|podes\s+explicar\s+de\s+outra\s+forma/i;
// Linguagem que afirma conclusão. Só pode sair depois de escrita real.
const CLAIMS_COMPLETION_RE =
  /\b(feito|combinado|tratado|resolvido|est[áa]\s+feito|j[áa]\s+est[áa]|desmarquei|desmarcado|cancelei|cancelado|apaguei|limpei|registei|guardei|marquei|actualizei|atualizei)\b/i;

function parsePtAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/euros?|eur|€/g, "");
  const multiplier = /k$/.test(cleaned) ? 1000 : /m$/.test(cleaned) ? 1_000_000 : 1;
  const withoutSuffix = cleaned.replace(/[km]$/, "");
  const normalized = withoutSuffix.includes(",")
    ? withoutSuffix.replace(/\./g, "").replace(",", ".")
    : /\.\d{3}(?!\d)/.test(withoutSuffix)
      ? withoutSuffix.replace(/\./g, "")
      : withoutSuffix;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * multiplier) : null;
}

function formatPtMoney(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function todayLisbonYmd(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const part of parts) m[part.type] = part.value;
  return `${m.year}-${m.month}-${m.day}`;
}

function extractFinanceCommission(content: string): Record<string, unknown> | null {
  const text = content.trim();
  const lower = text.toLowerCase();
  if (!/\bcomiss(?:ã|a)o|\bcomiss(?:õ|o)es/.test(lower)) return null;
  const commissionRaw = text.match(/comiss(?:ã|a)o(?:\s+[^\d€]{0,30})?\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1] ?? null;
  const amount = parsePtAmount(commissionRaw);
  if (amount == null) return null;
  const productionRaw = text.match(/produ(?:ç|c)[aã]o(?:\s+de)?\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1] ?? null;
  const dealRaw = text.match(/neg[óo]cio\s+(?:do|da|de|dos|das)?\s*[^,.;]*?\s+por\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1]
    ?? text.match(/\bpor\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1]
    ?? null;
  const productionAmount = parsePtAmount(productionRaw);
  const dealValue = parsePtAmount(dealRaw);
  const propertyReference = text.match(/neg[óo]cio\s+(?:do|da|de|dos|das)\s+([^,.;]+?)(?:\s+por\s|,|$)/i)?.[1]?.trim() ?? null;
  const status = /\b(recebid[ao]|paga|pago)\b/i.test(text)
    ? "Recebida"
    : /\b(faturad[ao]|facturad[ao])\b/i.test(text)
      ? "Faturada"
      : "Prevista";
  const descriptionParts = [
    `Comissão ${propertyReference ? `do ${propertyReference}` : "do negócio"}`,
    dealValue != null ? `valor do negócio ${formatPtMoney(dealValue)}` : null,
    productionAmount != null ? `produção ${formatPtMoney(productionAmount)} + IVA` : null,
  ].filter(Boolean);
  return {
    type: "commission",
    amount,
    description: descriptionParts.join(" · "),
    status,
    movement_date: todayLisbonYmd(),
    category: "Comissão",
    deal_value: dealValue,
    production_amount: productionAmount,
    property_reference: propertyReference,
    opportunity_title: propertyReference ? `Negócio ${propertyReference}` : "Negócio fechado",
  };
}

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
  // Isolamento de testes — ver `channel-guard.ts`. Repetido aqui porque o
  // motor v3 também é invocado directamente (scripts, testes, fast-paths).
  if (blockedChannelReason(channel)) return { reply: NATURAL_FALLBACKS.didNotUnderstand };
  const trimmed = content.trim();
  if (!trimmed) return { reply: NATURAL_FALLBACKS.didNotUnderstand };

  const ctx: DomainContext = { supabase, userId, channel, sourceMessageId: sourceMessageId ?? null };

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
        if (saIsRejection(trimmed)) {
          if (fileId) await discardAudioFile(supabase, fileId, userId);
          await markPendingActionStatus(supabase, mediaPending.id, "cancelled");
          return { reply: "Certo, descartei o áudio. O que percebi dele fica guardado." };
        }
      }

      // "Descarta" dito DEPOIS de já ter confirmado o guardar: ou desfazemos
      // mesmo, ou dizemos claramente que o ficheiro ficou guardado e como
      // removê-lo. Nunca "fica sem efeito" sem dizer que efeito.
      if (!mediaPending && isDiscardAudioRequest(trimmed)) {
        const { discardAudioFile, findRecentlyKeptAudio } = await import("./audio-keep.server");
        const kept = await findRecentlyKeptAudio(supabase, userId, channel, UNDO_KEEP_WINDOW_MS);
        if (kept) {
          await discardAudioFile(supabase, kept.fileId, userId);
          await markPendingActionStatus(supabase, kept.pendingId, "cancelled", {
            error_message: "consultor desfez o guardar do áudio",
          });
          return { reply: UNDO_KEEP_DONE_REPLY };
        }
        const older = await findRecentlyKeptAudio(supabase, userId, channel, 7 * 24 * 60 * 60 * 1000);
        if (older) return { reply: UNDO_KEEP_TOO_LATE_REPLY };
      }
    }

    // Um pendente antigo, cuja pergunta já não é a que está em aberto, não
    // pode ser resolvido por uma resposta destinada a outro assunto.
    if (pending && !isAnswerablePending(pending, { lastAssistantContent: lastAssistantContent0 })) {
      await markPendingActionStatus(supabase, pending.id, "expired", {
        error_message: "stale: pergunta já não estava em aberto",
      });
      pending = null;
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
    if (pending && pending.intent === "create_prospecting_lead") {
      if (saIsConfirmation(trimmed)) {
        const exec = TOOL_REGISTRY.create_prospecting_lead;
        const t0 = Date.now();
        const result = await exec(ctx, pending.structured_payload ?? {});
        const okOk = !!result.ok && !(result.data as any)?.duplicate;
        const leadId = (result.data as any)?.lead?.id ?? (result.data as any)?.existing?.id ?? null;
        await markPendingActionStatus(supabase, pending.id, okOk ? "executed" : "failed", {
          created_resource_type: okOk ? "prospecting_lead" : null,
          created_resource_id: okOk ? leadId : null,
          error_message: okOk ? null : (result.error ?? "not_created"),
        });
        if (okOk && leadId) {
          try {
            await supabase.from("conversation_states").upsert({
              user_id: userId, channel, external_conversation_id: channel,
              last_entity_type: "prospecting_lead",
              last_entity_id: leadId,
              last_intent: "create_prospecting_lead",
            } as never, { onConflict: "user_id,channel,external_conversation_id" });
          } catch { /* noop */ }
          // Materializa também como Imóvel para aparecer na área /imoveis
          // com o estado "por_angariar" (oportunidade a captar). O consultor
          // pode enriquecer depois. Falhas aqui não bloqueiam a resposta.
          try {
            const payload: any = pending.structured_payload ?? {};
            const composedTitle = String(
              payload.title ??
                [payload.property_type ?? "Imóvel", payload.address_hint, payload.location]
                  .filter(Boolean).join(" · "),
            ).trim().slice(0, 200) || "Imóvel de prospeção";
            const { data: propRow } = await supabase
              .from("properties")
              .insert({
                user_id: userId,
                title: composedTitle,
                property_type: payload.property_type ?? null,
                typology: payload.typology ?? null,
                location: payload.location ?? null,
                address: payload.address_hint ?? null,
                status: "por_angariar",
                notes: payload.notes ?? null,
                source_channel: channel,
              } as never)
              .select("id")
              .maybeSingle();
            const propertyId = (propRow as any)?.id ?? null;
            if (propertyId) {
              await supabase
                .from("prospecting_leads")
                .update({ related_property_id: propertyId } as never)
                .eq("id", leadId)
                .eq("user_id", userId);
            }
          } catch { /* noop */ }
        }
        const dupLead = (result.data as any)?.duplicate === true;
        const baseReply = okOk
          ? "Feito. Registei a placa para contactares. Queres que te lembre de ligar?"
          : (dupLead
              ? "Já tinhas uma placa registada com esse número. Fica na mesma."
              : "Tentei mas não consegui guardar a placa. Podes tentar outra vez?");
        // Rede de segurança: placa confirmada que não chegou a ser criada
        // fica em Diversos > Por tratar (antes desaparecia sem rasto).
        const reply = await applySafetyNet(ctx, {
          content: pending.original_content || trimmed,
          outcome: okOk ? "executed_ok" : (dupLead ? "duplicate" : "tool_failed"),
          reason: result.error ?? "not_created",
          reply: baseReply,
        });
        try {
          await supabase.from("assessor_ai_logs").insert({
            user_id: userId, channel, model: "reasoning-engine-v3",
            intent: "prospecting_confirm_fast_path", confidence: 1,
            input_tokens: 0, output_tokens: 0, total_tokens: 0,
            latency_ms: Date.now() - t0, success: okOk, error: okOk ? null : (result.error ?? "not_created"),
            domain: "assessor", route: "v3", fallback_used: false,
            tool_name: "create_prospecting_lead", tool_success: okOk,
          } as never);
        } catch { /* noop */ }
        return { reply };
      }
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: "Está bem, não registei nada." };
      }
    }

    // Frase elíptica confirmada ("Seguimento à lead Maria Manuela 912...").
    // Só aqui é que se escreve: o Afonso propôs, o consultor disse sim.
    if (pending && pending.intent === "create_person_elliptic") {
      if (saIsConfirmation(trimmed)) {
        const payload = (pending.structured_payload ?? {}) as Record<string, any>;
        const name = String(payload.name ?? "").trim();
        const created = await TOOL_REGISTRY.create_person(ctx, {
          name,
          phone: payload.phone ?? null,
          relationship_type: "potencial_cliente",
          summary: String(pending.original_content ?? "").slice(0, 300) || null,
        });
        const personId = (created.data as any)?.person?.id ?? (created.data as any)?.id ?? null;
        let followUpOk = false;
        if (created.ok && payload.with_follow_up) {
          const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const fu = await TOOL_REGISTRY.create_follow_up(ctx, {
            title: `Seguimento a ${name}`,
            type: "tarefa",
            due_date: due,
            priority: "media",
            person_id: personId,
          });
          followUpOk = !!fu.ok;
        }
        await markPendingActionStatus(supabase, pending.id, created.ok ? "executed" : "failed", {
          created_resource_type: created.ok ? "person" : null,
          created_resource_id: created.ok ? personId : null,
          error_message: created.ok ? null : (created.error ?? "not_created"),
        });
        const baseReply = created.ok
          ? (followUpOk
              ? `Feito. Registei a ${name} e deixei um seguimento para amanhã.`
              : `Feito. Registei a ${name}.`)
          : "Tentei registar e não consegui. Podes repetir o nome e o número?";
        const reply = await applySafetyNet(ctx, {
          content: pending.original_content || trimmed,
          outcome: created.ok ? "executed_ok" : "tool_failed",
          reason: created.error ?? "not_created",
          reply: baseReply,
        });
        return { reply };
      }
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: "Está bem, não registei nada." };
      }
    }

    // Negócio proposto pelo Afonso — só cria depois do "sim".
    if (pending && pending.intent === "create_deal") {
      if (saIsConfirmation(trimmed)) {
        const exec = TOOL_REGISTRY.create_deal;
        const result = await exec(ctx, pending.structured_payload ?? {});
        const data = (result.data as any) ?? {};
        const okOk = !!result.ok;
        await markPendingActionStatus(supabase, pending.id, okOk ? "executed" : "failed", {
          created_resource_type: okOk ? "opportunity" : null,
          created_resource_id: okOk ? (data.id ?? null) : null,
          error_message: okOk ? null : (result.error ?? "not_created"),
        });
        if (okOk && data.id) {
          try {
            await supabase.from("conversation_states").upsert({
              user_id: userId, channel, external_conversation_id: channel,
              last_entity_type: "opportunity", last_entity_id: data.id, last_intent: "create_deal",
            } as never, { onConflict: "user_id,channel,external_conversation_id" });
          } catch { /* noop */ }
        }
        if (!okOk) {
          return { reply: `Não consegui criar o negócio: ${result.error ?? "tenta outra vez"}.` };
        }
        const extra = data.linkedMovements > 0
          ? ` Liguei ${data.linkedMovements === 1 ? "a comissão que já tinhas registada" : `${data.linkedMovements} movimentos financeiros`}.`
          : "";
        return {
          reply: data.duplicate
            ? `Já tinhas esse negócio aberto — "${data.title}". Não criei outro.${extra}`
            : `Feito. Abri o negócio "${data.title}", em "A começar".${extra}`,
        };
      }
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: "Está bem, não abri negócio nenhum." };
      }
    }

    // Processador de Áudio Imobiliário — proposta única com vários itens.
    if (pending && pending.intent === "audio_breakdown") {
      // A pergunta lateral do ficheiro só sai quando a proposta fecha, para
      // não competir com o "sim" que confirma os itens.
      const askAudioFile = async (reply: string): Promise<string> => {
        const payload = (pending!.structured_payload ?? {}) as Record<string, any>;
        const fileId = payload.audio_file_id ? String(payload.audio_file_id) : null;
        if (!fileId) return reply;
        const { askKeepAudio } = await import("./audio-keep.server");
        const { appendKeepQuestion } = await import("./audio-keep");
        const question = await askKeepAudio(supabase, {
          userId,
          channel,
          fileId,
          transcript: String(pending!.original_content ?? ""),
          subject: payload.subject ?? null,
        });
        return question ? appendKeepQuestion(reply, question) : reply;
      };
      if (saIsConfirmation(trimmed)) {
        const { executeAudioBreakdown } = await import("./audio-breakdown.server");
        const reply = await executeAudioBreakdown(ctx, pending);
        return { reply: await askAudioFile(reply) };
      }
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: await askAudioFile("Está bem, não guardei nada do áudio.") };
      }
      // Correção a um item específico antes do "sim" — a proposta mantém-se
      // aberta e é reescrita já corrigida.
      {
        const { coerceBreakdown, formatBreakdownRevised } = await import("./audio-breakdown");
        const { parseBreakdownEdit, applyBreakdownEdit, describeBreakdownEdit } =
          await import("./audio-breakdown-edit");
        const { todayLisbonYmd } = await import("./audio-breakdown.server");
        const current = coerceBreakdown(pending.structured_payload ?? {});
        const edit = parseBreakdownEdit(
          trimmed,
          current.items.length,
          todayLisbonYmd(),
          current.items,
        );
        if (edit) {
          const removedItem = edit.remove ? current.items[edit.index] : undefined;
          const next = applyBreakdownEdit(current, edit);
          if (!next.items.length) {
            await markPendingActionStatus(supabase, pending.id, "cancelled");
            return {
              reply: await askAudioFile("Tirei o último ponto — já não fica nada por guardar deste áudio."),
            };
          }
          const { updatePendingActionPayload } = await import("../memory.server");
          await updatePendingActionPayload(
            supabase,
            pending.id,
            {
              ...(next as unknown as Record<string, any>),
              audio_file_id: (pending.structured_payload as any)?.audio_file_id ?? null,
            },
            { status: "pending_confirmation" },
          );
          return { reply: formatBreakdownRevised(next, describeBreakdownEdit(edit, removedItem)) };
        }
      }
    }

    if (pending && pending.intent === "suggest_file_link") {
      // (ver também confirm_keep_photo, logo abaixo)
      // Sugestão de ligação extra de um documento (Drive Inteligente).
      // Confirmar acrescenta a ligação; recusar não mexe em nada.
      const payload = (pending.structured_payload ?? {}) as Record<string, any>;
      if (saIsConfirmation(trimmed)) {
        const { applyLinkSuggestion } = await import("@/lib/drive/link-suggestions.server");
        const reply = await applyLinkSuggestion(supabase, userId, payload);
        await markPendingActionStatus(supabase, pending.id, "executed", {
          created_resource_type: "file_link",
          created_resource_id: payload.file_id ?? null,
        });
        return { reply };
      }
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: "Sem problema, deixo a ligação como está." };
      }
    }

    // Foto sem valor documental: ficou de fora do Drive à espera de resposta.
    // "Sim" recupera-a com tudo; "não" deixa-a ir.
    if (pending && pending.intent === "confirm_keep_photo") {
      const payload = (pending.structured_payload ?? {}) as Record<string, any>;
      const fileId = payload.file_id ? String(payload.file_id) : null;
      if (saIsConfirmation(trimmed)) {
        if (fileId) {
          await supabase
            .from("uploaded_files")
            .update({ deleted_at: null, processing_status: "organized", photo_value: "documental" } as never)
            .eq("id", fileId)
            .eq("user_id", userId);
        }
        await markPendingActionStatus(supabase, pending.id, "executed", {
          created_resource_type: "uploaded_file",
          created_resource_id: fileId,
        });
        return { reply: "Guardei a foto no Drive Inteligente." };
      }
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: "Certo, não fica no Drive Inteligente." };
      }
    }

    // Feedback anunciado ("posso dar uma sugestão?") — aguarda o corpo.
    // Aqui já não é preciso repetir "sugestão"/"erro" nem falar do produto.
    if (pending && pending.intent === "collecting_feedback") {
      const payload = (pending.structured_payload ?? {}) as Record<string, any>;
      const kind: FeedbackKind = payload.kind === "bug" ? "bug" : "suggestion";
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: FEEDBACK_CANCELLED_REPLY };
      }
      if (isEmptyFeedbackBody(trimmed)) {
        return { reply: FEEDBACK_BODY_RETRY };
      }
      await markPendingActionStatus(supabase, pending.id, "executed");
      const { createPendingAction } = await import("../memory.server");
      const question = feedbackConfirmQuestion(kind);
      await createPendingAction(supabase, {
        userId,
        channel,
        intent: "record_product_feedback",
        originalContent: trimmed,
        payload: { kind, original: trimmed },
        pendingQuestion: question,
        currentQuestion: question,
      });
      return { reply: question };
    }

    if (pending && pending.intent === "clarify_feedback_target") {
      const payload = (pending.structured_payload ?? {}) as Record<string, any>;
      const kind: FeedbackKind = payload.kind === "bug" ? "bug" : "suggestion";
      const original = String(payload.original ?? pending.original_content ?? "");
      const answer = readClarifyAnswer(trimmed);
      if (answer === null) {
        return { reply: FEEDBACK_CLARIFY_RETRY };
      }
      await markPendingActionStatus(supabase, pending.id, answer === "product" ? "executed" : "cancelled");
      if (answer === "person") {
        return { reply: FEEDBACK_NOT_PRODUCT_REPLY };
      }
      const { createPendingAction } = await import("../memory.server");
      const question = feedbackConfirmQuestion(kind);
      await createPendingAction(supabase, {
        userId,
        channel,
        intent: "record_product_feedback",
        originalContent: original,
        payload: { kind, original },
        pendingQuestion: question,
        currentQuestion: question,
      });
      return { reply: question };
    }

    // Feedback sobre o produto — só grava depois de confirmação explícita.
    if (pending && pending.intent === "record_product_feedback") {
      // (nota) a recolha do corpo é tratada no bloco collecting_feedback.
      const payload = (pending.structured_payload ?? {}) as Record<string, any>;
      const kind: FeedbackKind = payload.kind === "bug" ? "bug" : "suggestion";
      if (saIsRejection(trimmed)) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return { reply: FEEDBACK_CANCELLED_REPLY };
      }
      // "sim" sozinho → guarda a mensagem original; texto novo → guarda esse.
      const body = saIsConfirmation(trimmed)
        ? String(payload.original ?? pending.original_content ?? "")
        : trimmed;
      const attachmentFileId = payload.attachment_file_id ? String(payload.attachment_file_id) : null;
      const saved = await saveProductFeedback(supabase, {
        userId, kind, body, channel, attachmentFileId,
      });
      await markPendingActionStatus(supabase, pending.id, saved ? "executed" : "failed", {
        created_resource_type: saved ? "product_feedback" : null,
        error_message: saved ? null : "feedback_insert_failed",
      });
      if (!saved) return { reply: FEEDBACK_FAILED_REPLY };
      return {
        reply: attachmentFileId ? FEEDBACK_SAVED_WITH_ATTACHMENT_REPLY : FEEDBACK_SAVED_REPLY,
      };
    }

    const commissionArgs = extractFinanceCommission(trimmed);
    if (commissionArgs) {
      const t0 = Date.now();
      const result = await TOOL_REGISTRY.create_financial_movement(ctx, commissionArgs);
      try {
        await supabase.from("assessor_ai_logs").insert({
          user_id: userId, channel, model: "reasoning-engine-v3",
          intent: "create_financial_movement_fast_path", confidence: 1,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          latency_ms: Date.now() - t0, success: !!result.ok, error: result.ok ? null : (result.error ?? null),
          domain: "financial", route: "v3-deterministic", fallback_used: !result.ok,
          tool_name: "create_financial_movement", tool_success: !!result.ok,
        } as never);
      } catch { /* noop */ }
      const amount = Number((commissionArgs as any).amount ?? 0);
      const reference = String((commissionArgs as any).property_reference ?? "negócio");
      if (result.ok && (result.data as any)?.duplicate === true) {
        return {
          reply: `Já tinha uma ${(commissionArgs as any).type === "expense" ? "despesa" : "comissão"} de ${formatPtMoney(amount)} registada hoje. É a mesma ou queres registar outra?`,
        };
      }
      const finReply = await applySafetyNet(ctx, {
        content: trimmed,
        outcome: result.ok ? "executed_ok" : "tool_failed",
        reason: result.error ?? "financial_failed",
        reply: result.ok
          ? `Feito. Registei a comissão de ${formatPtMoney(amount)} no ${reference}.`
          : "Tentei guardar a comissão e não consegui.",
      });
      return { reply: finReply };
    }

    // ---------- Router determinístico ----------
    // (0-) Frase elíptica sem verbo: "[intenção] à [entidade] [nome] [contacto]".
    // Quando a pessoa ainda não existe, isto falhava com "não percebi". Agora
    // propõe criação assistida — nunca cria sem confirmação.
    if (!pending) {
      const elliptic = detectEllipticEntity(trimmed);
      if (elliptic) {
        let alreadyKnown = false;
        try {
          if (elliptic.phone) {
            const { data: byPhone } = await supabase
              .from("people").select("id")
              .eq("user_id", userId).ilike("phone", `%${elliptic.phone.slice(-9)}%`)
              .limit(1).maybeSingle();
            if (byPhone) alreadyKnown = true;
          }
          if (!alreadyKnown) {
            const { data: byName } = await supabase
              .from("people").select("id")
              .eq("user_id", userId).ilike("name", `%${elliptic.name}%`)
              .limit(1).maybeSingle();
            if (byName) alreadyKnown = true;
          }
        } catch { /* em dúvida, segue o caminho normal */ }

        if (!alreadyKnown) {
          const question = ellipticConfirmQuestion(elliptic);
          const { createPendingAction } = await import("../memory.server");
          await createPendingAction(supabase, {
            userId,
            channel,
            intent: "create_person_elliptic",
            originalContent: trimmed,
            payload: {
              name: elliptic.name,
              phone: elliptic.phone,
              with_follow_up: elliptic.withFollowUp,
              entity_word: elliptic.entityWord,
            },
            pendingQuestion: question,
            currentQuestion: question,
          });
          return { reply: question };
        }
      }
    }

    // (0) Resumo rápido de pessoa — leitura pura, sem confirmação e sem
    // depender do nível de autonomia. Vem antes da agenda porque "o que
    // tenho sobre a Marta" partilha o mesmo verbo.
    const briefName = detectPersonBriefQuery(trimmed);
    if (briefName) {
      const t0 = Date.now();
      let reply: string;
      let okBrief = true;
      try {
        const lookup = await buildPersonBrief(ctx, briefName);
        reply =
          lookup.kind === "not_found"
            ? personNotFoundReply(briefName)
            : lookup.kind === "ambiguous"
              ? ambiguousPersonReply(lookup.names)
              : formatPersonBrief(lookup.brief);
      } catch (err) {
        okBrief = false;
        reply = NATURAL_FALLBACKS.aiDown;
        void err;
      }
      try {
        await supabase.from("assessor_ai_logs").insert({
          user_id: userId, channel, model: "reasoning-engine-v3",
          intent: "person_brief_fast_path", confidence: 1,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          latency_ms: Date.now() - t0, success: okBrief, error: okBrief ? null : "person_brief_failed",
          domain: "assessor", route: "v3-deterministic", fallback_used: !okBrief,
          tool_name: "person_brief", tool_success: okBrief,
        } as never);
      } catch { /* noop */ }
      return { reply };
    }

    // (a-1) "O que há de novo?" → novidades reais dos últimos 30 dias.
    // (a-0) Erro ou sugestão sobre o próprio produto → pede confirmação.
    const feedbackHit = !pending ? detectFeedbackTarget(trimmed) : null;
    if (feedbackHit) {
      const kind = feedbackHit.kind;
      const { createPendingAction } = await import("../memory.server");
      // Ambíguo (produto vs. proprietário/cliente) → clarifica primeiro.
      if (feedbackHit.target === "ambiguous") {
        const question = feedbackClarifyQuestion(kind);
        await createPendingAction(supabase, {
          userId,
          channel,
          intent: "clarify_feedback_target",
          originalContent: trimmed,
          payload: { kind, original: trimmed },
          pendingQuestion: question,
          currentQuestion: question,
        });
        return { reply: question };
      }
      await createPendingAction(supabase, {
        userId,
        channel,
        intent: "record_product_feedback",
        originalContent: trimmed,
        payload: { kind, original: trimmed },
        pendingQuestion: feedbackConfirmQuestion(kind),
        currentQuestion: feedbackConfirmQuestion(kind),
      });
      return { reply: feedbackConfirmQuestion(kind) };
    }

    // (a-0b) Abertura de feedback sem corpo ("posso dar uma sugestão?").
    // Abre um pending a aguardar o conteúdo em vez de cair em conversa solta.
    const announceKind = !pending ? detectFeedbackAnnouncement(trimmed) : null;
    if (announceKind) {
      const { createPendingAction } = await import("../memory.server");
      const ask = feedbackAskBody(announceKind);
      await createPendingAction(supabase, {
        userId,
        channel,
        intent: "collecting_feedback",
        originalContent: trimmed,
        payload: { kind: announceKind },
        pendingQuestion: ask,
        currentQuestion: ask,
      });
      return { reply: ask };
    }

    if (detectWhatsNewQuery(trimmed)) {
      const t0 = Date.now();
      let reply: string;
      let okNews = true;
      try {
        reply = formatWhatsNewReply(await listRecentProductUpdates(ctx));
        if (reply === NO_UPDATES_REPLY) {
          reply = noRecentUpdatesReply(await lastProductUpdate(ctx));
        }
      } catch {
        okNews = false;
        reply = NATURAL_FALLBACKS.aiDown;
      }
      try {
        await supabase.from("assessor_ai_logs").insert({
          user_id: userId, channel, model: "reasoning-engine-v3",
          intent: "whats_new_fast_path", confidence: 1,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          latency_ms: Date.now() - t0, success: okNews, error: okNews ? null : "product_updates_failed",
          domain: "assessor", route: "v3-deterministic", fallback_used: !okNews,
          tool_name: "product_updates", tool_success: okNews,
        } as never);
      } catch { /* noop */ }
      return { reply };
    }

    // (a0) Consulta explícita a Diversos → nunca é agenda.
    if (detectMiscQuery(trimmed)) {
      const t0 = Date.now();
      const { queryMisc } = await import("../engine.server");
      const reply = await queryMisc(supabase, userId, trimmed);
      try {
        await supabase.from("assessor_ai_logs").insert({
          user_id: userId, channel, model: "reasoning-engine-v3",
          intent: "misc_query_fast_path", confidence: 1,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          latency_ms: Date.now() - t0, success: true, error: null,
          domain: "assessor", route: "v3-deterministic", fallback_used: false,
          tool_name: "query_miscellaneous", tool_success: true,
        } as never);
      } catch { /* noop */ }
      return { reply };
    }

    // (a) Consulta de agenda → chama search_agenda directamente.
    const agendaPeriod = detectAgendaQuery(trimmed);
    if (agendaPeriod) {
      const t0 = Date.now();
      const r = await TOOL_REGISTRY.search_agenda(ctx, { period: agendaPeriod });
      const items: AgendaItem[] = ((r.data as any)?.items as AgendaItem[]) ?? [];
      const reply = formatAgendaReply(agendaPeriod, items);
      try {
        await supabase.from("assessor_ai_logs").insert({
          user_id: userId, channel, model: "reasoning-engine-v3",
          intent: "agenda_query_fast_path", confidence: 1,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          latency_ms: Date.now() - t0, success: !!r.ok, error: r.ok ? null : (r.error ?? null),
          domain: "assessor", route: "v3-deterministic", fallback_used: false,
          tool_name: "search_agenda", tool_success: !!r.ok,
        } as never);
      } catch { /* noop */ }
      return { reply };
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
      const reply =
        recentStatement && isBareAcknowledgement(trimmed)
          ? ACKNOWLEDGED_REPLY
          : BARE_CONFIRMATION_REPLY;
      try {
        await supabase.from("assessor_ai_logs").insert({
          user_id: userId, channel, model: "reasoning-engine-v3",
          intent: reply === ACKNOWLEDGED_REPLY ? "bare_acknowledgement" : "bare_confirmation_no_context",
          confidence: 1,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          latency_ms: 0, success: true, error: null,
          domain: "assessor", route: "v3-deterministic", fallback_used: false,
          tool_name: null, tool_success: null,
        } as never);
      } catch { /* noop */ }
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
  const searches = await search(ctx, observations, recommended);

  // Modo Sparring — treino de conversas. Nada vira registo enquanto estiver
  // activo: as tool_calls são descartadas antes do ACT.
  const convState = (searches as any).conversation_state ?? null;
  const sparringWasActive = isSparringActive(convState);
  const sparringWasPaused = isSparringPaused(convState);
  const resumed = sparringWasPaused && detectSparringContinue(trimmed);
  const sparringEnding = sparringWasActive && detectSparringEnd(trimmed);
  const startedNow = !sparringWasActive && (resumed || detectSparringStart(trimmed));
  // Enquanto activo (ou a fechar) nada vira registo.
  const sparringActive = sparringEnding || sparringWasActive || startedNow;
  const prevTurns = sparringWasActive ? sparringTurns(convState) : 0;
  const turns = sparringActive ? prevTurns + 1 : 0;
  // Fim automático ao fim de algumas trocas: pergunta se quer continuar.
  const autoPause = sparringActive && !sparringEnding && turns >= SPARRING_MAX_TURNS;
  const sparringClosing = sparringEnding || autoPause;

  if (sparringActive || sparringWasActive || sparringWasPaused) {
    try {
      await supabase.from("conversation_states").upsert({
        user_id: userId, channel, external_conversation_id: channel,
        active_topic: sparringEnding ? null : autoPause ? SPARRING_PAUSED_TOPIC : sparringActive ? SPARRING_TOPIC : null,
        sparring_turns: sparringClosing ? 0 : turns,
      } as never, { onConflict: "user_id,channel,external_conversation_id" });
    } catch { /* noop */ }
  }

  // Auditoria: início/fim do treino ficam visíveis nas ações autónomas.
  if (startedNow || sparringClosing) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rows: any[] = [];
      if (startedNow) {
        rows.push({
          admin_user_id: null, action: "sparring_started", target_user_id: userId,
          resource_type: "conversation", resource_id: channel,
          reason: "Modo treino (sparring) iniciado — escrita bloqueada.",
          metadata: { channel, resumed, source: "reasoning-engine-v3" },
        });
      }
      if (sparringClosing) {
        rows.push({
          admin_user_id: null, action: "sparring_ended", target_user_id: userId,
          resource_type: "conversation", resource_id: channel,
          reason: autoPause ? "Modo treino em pausa automática após várias trocas." : "Modo treino terminado pelo consultor.",
          metadata: { channel, turns, auto: autoPause, source: "reasoning-engine-v3" },
        });
      }
      await supabaseAdmin.from("admin_audit_logs").insert(rows as never);
    } catch { /* noop */ }
  }

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
  const toolResults = shouldAct ? await executeToolCalls(ctx, decideR.decision.tool_calls) : [];
  const allOk = toolResults.every((r) => r.ok);

  await applyMemoryWrites(ctx, decideR.decision.memory_writes);

  let reply = sanitizeReply(decideR.decision.natural_reply);
  if (autoPause && !reply.includes("continuar o treino")) {
    reply = `${reply}\n\n${SPARRING_CONTINUE_QUESTION}`.trim();
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
    archiveReason = "act sem ferramenta";
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

  // técnico, no máximo 2 frases, uma pergunta de cada vez.
  const prospectingActed = !!leadTool && leadTool.ok && !(leadTool.data as any)?.duplicate;
  // Leituras bem sucedidas: o consultor pediu para VER. A resposta tem de
  // trazer os dados devolvidos pela ferramenta — nunca "Feito." nem uma
  // frase de intenção ("Vou procurar…"). O bloco de resultados substitui a
  // frase gerada e não passa pelo corte de 2 frases (cortaria a lista).
  const queryReply = toolResults.some((t) => t.ok && isQueryTool(t.name))
    ? formatQueryResults(toolResults)
    : null;
  // A lista de desmarcações também não passa pelo corte de 2 frases.
  if (queryReply || cancelTool) {
    if (queryReply) reply = queryReply;
  } else {
    reply = enforceHumanTone(reply, { actionExecutedOk: (shouldAct && allOk) || prospectingActed });
    if (decideR.decision.action === "ask") {
      reply = enforceSingleQuestion(reply);
    }
  }
  // Ordem correcta: o outcome real (execução) manda sobre a frase gerada.
  // Quando a ferramenta correu bem, a resposta NUNCA pode ser linguagem de
  // incompreensão — nem por fallback, nem porque o passo de redacção falhou.
  const executedOk = (shouldAct && allOk) || prospectingActed;
  if (executedOk) {
    const soundsLikeFailure =
      !reply ||
      reply === NATURAL_FALLBACKS.didNotUnderstand ||
      reply === NATURAL_FALLBACKS.aiDown ||
      NOT_UNDERSTOOD_RE.test(reply);
    if (soundsLikeFailure) reply = NATURAL_FALLBACKS.done;
  }
  if (!reply) {
    // Sem execução e sem resposta: a origem manda no texto. Se a IA esteve
    // indisponível, dizemos isso; só dizemos "não percebi" quando o serviço
    // respondeu e mesmo assim não chegámos a lado nenhum.
    reply = aiUnavailable ? NATURAL_FALLBACKS.aiDown : NATURAL_FALLBACKS.didNotUnderstand;
  }
  // Mesmo que o modelo tenha devolvido texto parcial de incompreensão numa
  // falha de serviço, a mensagem honesta é a de indisponibilidade.
  if (aiUnavailable && !shouldAct && !prospectingActed && NOT_UNDERSTOOD_RE.test(reply)) {
    reply = NATURAL_FALLBACKS.aiDown;
  }

  // Rede de segurança final: quando o motor não executou nada e a resposta é
  // um fallback de não-compreensão (ou o DECIDE/THINK falhou), a mensagem
  // original fica em Diversos > Por tratar antes de responder.
  if (archiveOutcome === "executed_ok" && !shouldAct && !prospectingActed) {
    if (aiUnavailable) {
      archiveOutcome = "service_down";
      archiveReason = decideR.error ?? thinkR.error ?? "serviço de IA indisponível";
    } else {
    const isFallbackReply =
      reply === NATURAL_FALLBACKS.didNotUnderstand ||
      reply === NATURAL_FALLBACKS.aiDown ||
      NOT_UNDERSTOOD_RE.test(reply);
    if (isFallbackReply || decideR.error || thinkR.error) {
      archiveOutcome = "not_understood";
      archiveReason = decideR.error ?? thinkR.error ?? "não percebi a mensagem";
    }
    }
  }
  // Em treino nada é arquivado: a simulação não pode deixar rasto em Diversos.
  if (!sparringActive) {
  reply = await applySafetyNet(ctx, {
    content: buildArchiveContent({
      trimmed,
      pendingContent: pendingForArchive?.original_content ?? null,
      recentRows: (recentRows as any[]) ?? [],
    }),
    outcome: archiveOutcome,
    reason: archiveReason,
    reply,
  });
  }

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
    // A mensagem ACTUAL do consultor já está gravada em `recentRows`; se a
    // apanhássemos aqui, a diferença seria ≈0 s e quase tudo virava
    // "reformulação". Excluímo-la explicitamente.
    const userRows = ((recentRows as any[]) ?? []).filter((r) => r?.role === "user");
    // Índice da mensagem actual (por id, ou a mais recente com o mesmo texto).
    let curIdx = sourceMessageId ? userRows.findIndex((r) => r?.id === sourceMessageId) : -1;
    if (curIdx < 0) curIdx = userRows.findIndex((r) => String(r?.content ?? "").trim() === trimmed);
    // A repetição genuína tem o mesmo texto: só saltamos UMA ocorrência.
    const prevUserRow = userRows[(curIdx < 0 ? -1 : curIdx) + 1] ?? null;
    const prevUserAt = prevUserRow?.created_at ?? null;
    const signals = computeQualitySignals({
      decision: decideR.decision,
      toolResults,
      reply,
      previousUserTurnAt: prevUserAt ? new Date(prevUserAt) : null,
      message: trimmed,
      previousUserMessage: prevUserRow ? String(prevUserRow.content ?? "") : null,
      lastAssistantReply,
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

  // Shadow Mode — estratégia alternativa amostrada, não bloqueia a resposta.
  if (shouldRunShadow()) {
    void runShadow(supabase, {
      userId, channel, traceId,
      strategy: "decide_temp_0.6",
      content: trimmed,
      observations,
      hypotheses: thinkR.output.hypotheses,
      searches,
      historyPreview,
      assessorName,
      userFirstName,
      nowLisbonYmd: nowLisbonYmd(),
      nowLisbonHuman: nowLisbonHuman(),
      baseline: { action: decideR.decision.action, reply },
    });
  }

  // Oferta das perguntas de arranque — só numa pausa natural: nada em curso,
  // nenhuma execução neste turno e a resposta não terminou já com pergunta.
  try {
    const busyWithTask =
      sparringActive ||
      decideR.decision.action === "act" ||
      decideR.decision.action === "ask" ||
      toolResults.length > 0 ||
      !!pendingForArchive;
    const offer = nextOnboardingOffer(onboarding, {
      replyIsQuestion: reply.includes("?"),
      busyWithTask,
    });
    if (offer === "name") {
      await markOnboardingOffered(supabase, userId, "name_asked", onboarding.offers);
      reply = appendOffer(reply, NAME_QUESTION(assessorName));
    } else if (offer === "goals") {
      await markOnboardingOffered(supabase, userId, "goals_asked", onboarding.offers);
      reply = appendOffer(reply, GOALS_QUESTION);
    }
  } catch { /* noop */ }

  return { reply };
}
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
import type { DomainContext } from "../v2/domain.server";
import { TOOL_REGISTRY } from "../v2/domain.server";
import {
  findActivePendingAction,
  markPendingActionStatus,
} from "../memory.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../culture/short-answers";
import {
  detectAgendaQuery,
  formatAgendaReply,
  BARE_CONFIRMATION_REPLY,
  hasValidPendingContext,
  type AgendaItem,
} from "./deterministic.server";
import { applySafetyNet } from "./safety-net.server";

const HISTORY_LIMIT = 6;

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

  // Fast-path prospeção — se existe uma proposta pendente de placa e o
  // consultor confirma/cancela, resolvemos sem passar por THINK/DECIDE.
  // Garante que o "Feito" só sai depois da persistência real.
  try {
    const pending = await findActivePendingAction(supabase, userId, channel);
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
        const reply = okOk
          ? "Feito. Registei a placa para contactares. Queres que te lembre de ligar?"
          : ((result.data as any)?.duplicate
              ? "Já tinhas uma placa registada com esse número. Fica na mesma."
              : "Tentei mas não consegui guardar a placa. Podes tentar outra vez?");
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

    const commissionArgs = extractFinanceCommission(trimmed);
    if (commissionArgs) {
      const t0 = Date.now();
      const result = await TOOL_REGISTRY.create_financial_movement(ctx, commissionArgs);
      if (!result.ok) {
        try { await saveFailedActionAsMiscellaneous(ctx, trimmed, result.error ?? "financial_failed"); }
        catch { /* noop */ }
      }
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
      return result.ok
        ? { reply: `Feito. Registei a comissão de ${formatPtMoney(amount)} no ${reference}.` }
        : { reply: "Tentei guardar a comissão e não consegui. Deixei em Diversos para não se perder." };
    }

    // ---------- Router determinístico ----------
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
      try {
        await supabase.from("assessor_ai_logs").insert({
          user_id: userId, channel, model: "reasoning-engine-v3",
          intent: "bare_confirmation_no_context", confidence: 1,
          input_tokens: 0, output_tokens: 0, total_tokens: 0,
          latency_ms: 0, success: true, error: null,
          domain: "assessor", route: "v3-deterministic", fallback_used: false,
          tool_name: null, tool_success: null,
        } as never);
      } catch { /* noop */ }
      return { reply: BARE_CONFIRMATION_REPLY };
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
    try {
      const reason = toolResults.filter((r) => !r.ok).map((r) => `${r.name}:${r.error ?? "unknown"}`).join("; ");
      await saveFailedActionAsMiscellaneous(ctx, trimmed, reason || "tool_failed");
    } catch { /* noop */ }
    reply = "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?";
  }

  // Idempotência: se `create_follow_up`/`create_event` devolveu um recurso
  // pré-existente para a mesma pending_action, respondemos de forma explícita
  // em vez de fingir que criámos algo novo.
  const idemHit = toolResults.find(
    (t) => (t.name === "create_follow_up" || t.name === "create_event")
      && t.ok && (t.data as any)?.idempotent === true,
  );
  if (idemHit) {
    reply = (idemHit.data as any)?.rescheduled
      ? "Já tinhas esse seguimento. Passei-o para o novo horário."
      : "Já estava registado.";
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

  // Ajustes culturais finais: sem "Feito" pré-execução, sem vocabulário
  // Financeiro: duplicado do mesmo dia — pergunta antes de assumir novo registo.
  const finTool = toolResults.find((t) => t.name === "create_financial_movement");
  if (finTool?.ok && (finTool.data as any)?.duplicate === true) {
    const existing = (finTool.data as any)?.existing ?? {};
    const kind = existing.type === "expense" ? "despesa" : "comissão";
    reply = `Já tinha uma ${kind} desse valor registada hoje. É a mesma ou queres registar outra?`;
  }

  // técnico, no máximo 2 frases, uma pergunta de cada vez.
  const prospectingActed = !!leadTool && leadTool.ok && !(leadTool.data as any)?.duplicate;
  reply = enforceHumanTone(reply, { actionExecutedOk: (shouldAct && allOk) || prospectingActed });
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

  return { reply };
}
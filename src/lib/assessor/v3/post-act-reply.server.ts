// Pós-ACT — finalização do texto da resposta a partir do que foi mesmo
// escrito na base de dados.
//
// Extraído do motor v3 sem alterar comportamento nem ordem. Os três blocos de
// confirmação de contacto (`confirm_event_person`) ficam deliberadamente
// inline no motor: a decisão de os fundir é um lote próprio.
//
// A ordem preservada é:
//   1. shapeExecutionOutcome  (falha de ferramenta, acto sem ferramenta, idempotência)
//   2. shapeAgendaAsks        (reagendamento, escolha de calendário)
//   3. [inline no motor]      confirmação de contacto ×3
//   4. shapeToolReplies       (prospeção, desmarcação, conclusão, financeiro)

import { claimsCompletion, unverifiedCompletionReply, recurrenceQuestion } from "./completion-intent";
import { createPendingAction } from "../memory.server";

export type ToolResult = { name: string; ok: boolean; data?: unknown; error?: string | null };
export type ArchiveOutcome = "executed_ok" | "tool_failed" | "not_understood" | "service_down";

const CLAIMS_COMPLETION_RE =
  /\b(feito|combinado|tratado|resolvido|est[áa]\s+feito|j[áa]\s+est[áa]|desmarquei|desmarcado|cancelei|cancelado|apaguei|limpei|registei|guardei|marquei|actualizei|atualizei)\b/i;

/**
 * Resultado da execução: transforma o texto do modelo naquilo que é honesto
 * dizer depois de correr (ou falhar) as ferramentas.
 */
export function shapeExecutionOutcome(params: {
  reply: string;
  toolResults: ToolResult[];
  shouldAct: boolean;
  allOk: boolean;
  actedWithoutTools: boolean;
  pureRead: boolean;
  readFailedReply: string;
}): { reply: string; archiveOutcome: ArchiveOutcome; archiveReason: string | null } {
  let reply = params.reply;
  let archiveOutcome: ArchiveOutcome = "executed_ok";
  let archiveReason: string | null = null;

  // Executou e mesmo assim perguntou ("Marco a ação ... ?") — a pergunta faz o
  // consultor responder "Sim" e o turno seguinte volta a executar o mesmo.
  if (params.shouldAct && params.allOk && /\?\s*$/.test(reply)) {
    reply = "Feito.";
  }
  if (params.shouldAct && !params.allOk) {
    archiveOutcome = "tool_failed";
    archiveReason = params.toolResults.filter((r) => !r.ok)
      .map((r) => `${r.name}:${r.error ?? "unknown"}`).join("; ") || "tool_failed";
    reply = params.pureRead
      ? params.readFailedReply
      : "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?";
  }
  if (params.actedWithoutTools && !params.pureRead) {
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
  const idemHit = params.toolResults.find(
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

  return { reply, archiveOutcome, archiveReason };
}

/** Perguntas de agenda: reagendamento provável e escolha de calendário. */
export async function shapeAgendaAsks(params: {
  supabase: any;
  userId: string;
  channel: string;
  sourceMessageId?: string | null;
  trimmed: string;
  reply: string;
  toolResults: ToolResult[];
}): Promise<{ reply: string; rescheduleAsk: boolean }> {
  let reply = params.reply;

  // Compromisso provavelmente já existente com outra hora: perguntar sempre,
  // nunca duplicar em silêncio (caso real da consulta às 09:00 → 10:30).
  const rescheduleAsk = params.toolResults.find(
    (t) => t.name === "create_event" && t.ok
      && (t.data as any)?.needsRescheduleConfirmation === true,
  );
  if (rescheduleAsk) {
    const d = rescheduleAsk.data as any;
    const { rescheduleQuestion } = await import("../event-subject");
    const question = rescheduleQuestion(d.candidate, d.incoming);
    try {
      await createPendingAction(params.supabase, {
        userId: params.userId, channel: params.channel,
        intent: "confirm_event_reschedule",
        originalContent: params.trimmed,
        payload: { candidate: d.candidate, incoming: d.incoming },
        currentQuestion: question,
        pendingQuestion: question,
        sourceMessageId: params.sourceMessageId ?? null,
      });
    } catch { /* noop */ }
    reply = question;
  }

  // Compromisso agendado sem calendário activo escolhido.
  const calendarChoiceAsk = params.toolResults.find(
    (t) => t.name === "create_event" && t.ok
      && (t.data as any)?.needsCalendarProviderChoice === true,
  );
  if (calendarChoiceAsk) {
    const { CALENDAR_PROVIDER_CHOICE_REPLY } = await import("@/lib/providers/active");
    reply = CALENDAR_PROVIDER_CHOICE_REPLY;
  }

  return { reply, rescheduleAsk: !!rescheduleAsk };
}

/**
 * Confirmação de contacto (`confirm_event_person`) — um único caminho para as
 * três escritas que resolvem pessoa antes de gravar. A ordem é a histórica
 * (compromisso → seguimento → proprietário) e o primeiro match ganha: nunca
 * abrimos duas perguntas de contacto no mesmo turno.
 */
const PERSON_ASK_TOOLS = ["create_event", "create_follow_up", "update_property"] as const;

export async function shapePersonAsk(params: {
  supabase: any;
  userId: string;
  channel: string;
  sourceMessageId?: string | null;
  trimmed: string;
  reply: string;
  toolResults: ToolResult[];
}): Promise<{ reply: string; asked: boolean }> {
  for (const toolName of PERSON_ASK_TOOLS) {
    const hit = params.toolResults.find(
      (t) => t.name === toolName && t.ok
        && (t.data as any)?.needsPersonConfirmation === true,
    );
    if (!hit) continue;
    const d = hit.data as any;
    const { personResolutionQuestion } = await import("@/lib/people/resolve-person.server");
    const question = personResolutionQuestion({
      status: d.mode, personId: null, name: d.personName ?? null,
      candidates: d.suggestions ?? [],
    });
    try {
      await createPendingAction(params.supabase, {
        userId: params.userId, channel: params.channel,
        intent: "confirm_event_person",
        originalContent: params.trimmed,
        payload: {
          personName: d.personName,
          mode: d.mode,
          suggestions: d.suggestions ?? [],
          candidate_ids: d.candidateIds ?? [],
          tool: toolName,
          incoming: d.incoming,
        },
        currentQuestion: question,
        pendingQuestion: question,
        sourceMessageId: params.sourceMessageId ?? null,
      });
    } catch { /* noop */ }
    return { reply: question, asked: true };
  }
  return { reply: params.reply, asked: false };
}

/** Prospeção, desmarcações, conclusões e movimentos financeiros. */
export async function shapeToolReplies(params: {
  ctx: any;
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  reply: string;
  toolResults: ToolResult[];
  leadTool: ToolResult | undefined;
  convState: any;
  decideR: any;
}): Promise<{ reply: string; cancelTool: ToolResult | undefined }> {
  const { supabase, userId, channel, trimmed, toolResults, leadTool } = params;
  let reply = params.reply;

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

  // Dinheiro registado sem negócio: é aqui que o ciclo se fechava sozinho no
  // vazio. O Afonso propõe abrir o negócio que une pessoa, imóvel e comissão.
  const finOk = toolResults.find(
    (t) => t.name === "create_financial_movement" && t.ok && !(t.data as any)?.duplicate,
  );
  if (finOk) {
    try {
      const mv = (finOk.data as any)?.movement ?? {};
      const finArgs = (params.decideR.decision.tool_calls.find(
        (t: any) => t.name === "create_financial_movement",
      )?.arguments ?? {}) as Record<string, any>;
      const hasDeal = !!(mv.opportunity_id ?? (finOk.data as any)?.opportunity_id);
      let propertyId: string | null = finArgs.property_id ?? null;
      let personId: string | null = (params.convState as any)?.active_person_id ?? null;

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
          sourceMessageId: params.ctx.sourceMessageId ?? null,
        });
        const visitNote = visitHits.length
          ? ` Já tinhas ${visitHits.length === 1 ? "uma visita" : `${visitHits.length} visitas`} ao mesmo ${hint?.label ?? "imóvel"}.`
          : "";
        const propNote = !propertyId && hint ? ` Crio também a ficha do ${hint.label}.` : "";
        reply = `${reply}${visitNote} Isto ainda não está ligado a nenhum negócio.${propNote} Queres que abra "${title}" para juntar tudo?`.trim();
      }
    } catch { /* a sugestão nunca pode estragar o registo */ }
  }

  // Financeiro: duplicado do mesmo dia — pergunta antes de assumir novo registo.
  const finTool = toolResults.find((t) => t.name === "create_financial_movement");
  if (finTool?.ok && (finTool.data as any)?.duplicate === true) {
    const existing = (finTool.data as any)?.existing ?? {};
    const kind = existing.type === "expense" ? "despesa" : "comissão";
    reply = `Já tinha uma ${kind} desse valor registada hoje. É a mesma ou queres registar outra?`;
  }

  return { reply, cancelTool };
}

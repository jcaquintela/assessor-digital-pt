// Ramos pré-pendente — extraído do motor v3 (Lote 8) sem alteração de lógica
// nem de ordem: guião de prospeção → resposta de recorrência → escolha de
// desmarcação (com janela de rajada).

import type { EngineOutcome } from "../engine.server";
import type { DomainContext } from "../v2/domain.server";
import { TOOL_REGISTRY } from "../v2/domain.server";
import { findActivePendingAction, markPendingActionStatus } from "../memory.server";
import { isRejection as saIsRejection } from "../culture/short-answers";
import { isDiscardCommand } from "../culture/discard";

/** Guião de abordagem a uma placa de particular. */
export async function runScriptOfferPending(args: {
  supabase: any; userId: string; channel: string; trimmed: string;
}): Promise<EngineOutcome | null> {
  const { supabase, userId, channel, trimmed } = args;
  try {
    const { resolveScriptPending } = await import("@/lib/prospecting/script-offer.server");
    const scriptReply = await resolveScriptPending({ supabase, userId, channel }, trimmed);
    if (scriptReply) return { reply: scriptReply };
  } catch { /* noop */ }
  return null;
}

/** Recorrência + escolha de qual (ou quais) compromisso desmarcar. */
export async function runRecurrenceAndCancelChoice(args: {
  ctx: DomainContext;
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  sourceMessageId: string | null;
}): Promise<EngineOutcome | null> {
  const { ctx, supabase, userId, channel, trimmed, sourceMessageId } = args;
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
  return null;
}

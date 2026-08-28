// Passe de conclusões — extraído do motor v3 (Lote 8) sem alteração de lógica
// nem de ordem. Trata "o estudo de mercado já está tratado", a confirmação
// elíptica ancorada ao briefing e a rede de segurança de resultados.

import type { EngineOutcome } from "../engine.server";
import type { DomainContext } from "../v2/domain.server";
import { TOOL_REGISTRY } from "../v2/domain.server";
import { createPendingAction } from "../memory.server";
import {
  detectCompletionInstructions,
  formatCompletionReply,
  recurrenceQuestion,
  remainingRequest,
  remainderNeedsWork,
  ambiguousCompletionQuestion,
} from "./completion-intent";
import { anchorFromBriefing, isEllipticCompletion } from "./briefing-anchor";

export async function runCompletionPass(args: {
  ctx: DomainContext;
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  rerun: (content: string) => Promise<EngineOutcome>;
}): Promise<EngineOutcome | null> {
  const { ctx, supabase, userId, channel, trimmed, rerun } = args;

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
        const out = await rerun(rest);
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

  return null;
}

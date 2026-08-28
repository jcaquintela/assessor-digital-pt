// Higiene do rascunho vivo — extraído do motor v3 (Lote 8) sem alteração de
// lógica nem de ordem: pendente caducado → reabertura de confirmação velha →
// "só registar" (sem lembrete).

import type { EngineOutcome } from "../engine.server";
import type { DomainContext } from "../v2/domain.server";
import { markPendingActionStatus } from "../memory.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../culture/short-answers";
import { isRegisterOnly, isAnswerablePending } from "../pending-answerable";
import { archiveToMiscellaneous } from "./safety-net.server";

export type StalePendingResult =
  | { kind: "reply"; outcome: EngineOutcome }
  | { kind: "continue"; pending: any | null };

export async function resolveStalePending(args: {
  ctx: DomainContext;
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  pending: any | null;
  lastAssistantContent0: string;
  lastAssistantAskedQuestion: boolean;
  quotedText: string | null;
}): Promise<StalePendingResult> {
  const {
    ctx, supabase, userId, channel, trimmed,
    lastAssistantContent0, lastAssistantAskedQuestion, quotedText,
  } = args;
  let pending = args.pending;

  // Um pendente antigo, cuja pergunta já não é a que está em aberto, não
  // pode ser resolvido por uma resposta destinada a outro assunto.
  if (
    pending &&
    !isAnswerablePending(pending, {
      lastAssistantContent: lastAssistantContent0,
      quotedText,
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
      quotedMatchesPending(pending, quotedText);
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
      return { kind: "reply", outcome: { reply } };
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
        staleQuoted(stale, quotedText));
    if (stale && staleRelevant) {
      const { expiredConfirmationReply, isDestructiveConfirmation } =
        await import("../expired-confirmation");
      // Fecha o assunto: o aviso é dado uma vez, não a cada "sim" solto.
      await markPendingActionStatus(supabase, stale.id, "cancelled", {
        error_message: "confirmação caducada — avisado o consultor",
      });
      return {
        kind: "reply",
        outcome: {
          reply: expiredConfirmationReply(stale.current_question ?? stale.pending_question, {
            destructive: isDestructiveConfirmation(
              stale.intent,
              stale.structured_payload as Record<string, unknown>,
            ),
          }),
        },
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
      kind: "reply",
      outcome: {
        reply: saved
          ? "Certo — fica só registado, sem lembrete. Deixei em Diversos."
          : "Certo — fica só registado, sem lembrete.",
      },
    };
  }

  return { kind: "continue", pending };
}

// Confirmação curta sem contexto pendente — extraído do motor v3 (Lote 8)
// sem alteração de lógica nem de ordem.

import type { EngineOutcome } from "../engine.server";
import { isConfirmation as saIsConfirmation } from "../culture/short-answers";
import {
  ACKNOWLEDGED_REPLY,
  BARE_CONFIRMATION_REPLY,
  hasValidPendingContext,
  isBareAcknowledgement,
} from "./deterministic.server";
import { logAiTurn } from "./telemetry-repo.server";

export async function resolveBareConfirmation(args: {
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  pending: any | null;
  lastAssistantContent0: string;
  lastAssistantAt0: Date | null;
  lastAssistantAskedQuestion: boolean;
  sourceMessageId: string | null;
}): Promise<EngineOutcome | null> {
  const {
    supabase, userId, channel, trimmed, pending,
    lastAssistantContent0, lastAssistantAt0, lastAssistantAskedQuestion, sourceMessageId,
  } = args;

  if (
    !(saIsConfirmation(trimmed) &&
      !hasValidPendingContext(pending) &&
      !lastAssistantAskedQuestion)
  ) return null;

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

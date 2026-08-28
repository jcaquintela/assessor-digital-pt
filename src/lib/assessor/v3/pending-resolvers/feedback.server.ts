// Ramos de pendente do feedback de produto (baixo acoplamento).
//
// Recolha do corpo, esclarecimento de alvo (produto vs. pessoa) e gravação
// final — sempre com confirmação explícita antes de escrever.

import { markPendingActionStatus, createPendingAction } from "../../memory.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../../culture/short-answers";
import {
  feedbackConfirmQuestion,
  isEmptyFeedbackBody,
  FEEDBACK_BODY_RETRY,
  readClarifyAnswer,
  FEEDBACK_CLARIFY_RETRY,
  FEEDBACK_NOT_PRODUCT_REPLY,
  FEEDBACK_CANCELLED_REPLY,
  FEEDBACK_FAILED_REPLY,
  feedbackSavedReply,
  type FeedbackKind,
} from "../feedback";
import { saveProductFeedback } from "../feedback.server";
import type { PendingResolver } from "./types";

/** collecting_feedback — feedback anunciado; aguarda o corpo. */
export const collectingFeedbackPending: PendingResolver = async ({ supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "collecting_feedback") return null;
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
};

/** clarify_feedback_target — é sobre o produto ou sobre uma pessoa? */
export const clarifyFeedbackTargetPending: PendingResolver = async ({ supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "clarify_feedback_target") return null;
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
};

/** record_product_feedback — só grava depois de confirmação explícita. */
export const recordProductFeedbackPending: PendingResolver = async ({ supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "record_product_feedback") return null;
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
    reply: feedbackSavedReply(kind, {
      title: body,
      withAttachment: Boolean(attachmentFileId),
    }),
  };
};

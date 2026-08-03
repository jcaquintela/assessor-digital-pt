// Escrita do feedback do consultor. Só é chamada depois de confirmação explícita.

import type { FeedbackKind } from "./feedback";

export async function saveProductFeedback(
  supabase: any,
  input: {
    userId: string;
    kind: FeedbackKind;
    body: string;
    channel: string;
    attachmentFileId?: string | null;
  },
): Promise<boolean> {
  const body = String(input.body ?? "").trim().slice(0, 4000);
  if (!body) return false;
  const { error } = await supabase.from("product_feedback").insert({
    user_id: input.userId,
    kind: input.kind,
    body,
    channel: input.channel,
    status: "novo",
    attachment_file_id: input.attachmentFileId ?? null,
  } as never);
  return !error;
}

/**
 * Anexa um ficheiro (screenshot, documento) a um report de erro/sugestão que
 * ainda está por confirmar. Guarda no rascunho para ser gravado no registo.
 * Devolve true quando o anexo ficou associado ao rascunho.
 */
export async function attachFileToPendingFeedback(
  supabase: any,
  input: { userId: string; channel: string; fileId: string },
): Promise<boolean> {
  const { findActivePendingAction } = await import("../memory.server");
  const pending = await findActivePendingAction(supabase, input.userId, input.channel);
  if (!pending || pending.intent !== "record_product_feedback") return false;
  const payload = { ...((pending.structured_payload ?? {}) as Record<string, unknown>) };
  payload['attachment_file_id'] = input.fileId;
  const { error } = await supabase
    .from("pending_actions")
    .update({ structured_payload: payload } as never)
    .eq("id", pending.id);
  return !error;
}

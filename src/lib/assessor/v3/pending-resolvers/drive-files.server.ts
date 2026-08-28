// Ramos de pendente do Drive Inteligente (baixo acoplamento).
//
// Sugestão de ligação de documento, foto sem valor documental e acção em
// lote (arquivar/apagar). A IA nunca escreve aqui: só se toca na base de
// dados depois de o consultor confirmar a lista que viu.

import { markPendingActionStatus } from "../../memory.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../../culture/short-answers";
import type { PendingResolver } from "./types";

/** suggest_file_link — acrescentar uma ligação extra a um documento. */
export const suggestFileLinkPending: PendingResolver = async ({ supabase, userId, trimmed, pending }) => {
  if (!pending || pending.intent !== "suggest_file_link") return null;
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
  return null;
};

/**
 * confirm_keep_photo — foto sem valor documental ficou de fora do Drive à
 * espera de resposta. "Sim" recupera-a com tudo; "não" deixa-a ir.
 */
export const keepPhotoPending: PendingResolver = async ({ supabase, userId, trimmed, pending }) => {
  if (!pending || pending.intent !== "confirm_keep_photo") return null;
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
  return null;
};

/**
 * confirm_bulk_archive — acção em lote sobre ficheiros do Drive. Só corre
 * depois de o consultor ver a lista e confirmar.
 */
export const bulkArchivePending: PendingResolver = async ({ supabase, userId, trimmed, pending }) => {
  if (!pending || pending.intent !== "confirm_bulk_archive") return null;
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const ids: string[] = Array.isArray(payload.file_ids) ? payload.file_ids.map(String) : [];
  const kind = (payload.kind ?? "any") as any;
  const mode = payload.mode === "delete" ? "delete" : "archive";
  if (saIsConfirmation(trimmed)) {
    const { archiveFilesBulk, deleteFilesBulk } = await import("@/lib/drive/bulk-archive.server");
    const { fileActionDoneReply } = await import("@/lib/drive/bulk-archive");
    let count = 0;
    let okBulk = true;
    try {
      count = mode === "delete"
        ? await deleteFilesBulk(supabase, userId, ids)
        : await archiveFilesBulk(supabase, userId, ids);
    } catch {
      okBulk = false;
    }
    await markPendingActionStatus(supabase, pending.id, okBulk ? "executed" : "failed", {
      created_resource_type: "uploaded_file",
      error_message: okBulk ? null : `bulk_${mode}_failed`,
    });
    return {
      reply: okBulk
        ? fileActionDoneReply(kind, count, mode)
        : mode === "delete"
          ? "Tentei apagar os ficheiros e não consegui. Tenta outra vez daqui a pouco."
          : "Tentei arquivar os ficheiros e não consegui. Tenta outra vez daqui a pouco.",
    };
  }
  if (saIsRejection(trimmed)) {
    const { fileActionCancelledReply } = await import("@/lib/drive/bulk-archive");
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    return { reply: fileActionCancelledReply(mode) };
  }
  return null;
};

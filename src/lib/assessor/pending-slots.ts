// Ranhuras (slots) de rascunhos pendentes.
//
// Causa real de um bug: o motor só segurava UM pendente por consultor+canal.
// Uma lista de escolha de documento e uma pergunta de agendamento ficavam a
// competir pela mesma linha — o "não" dado ao agendamento cancelava a lista.
// Cada família de pedidos passa a ter a sua ranhura: uma resposta só resolve
// (ou cancela) o pedido da ranhura a que pertence.

export type PendingSlot = "main" | "documents";

const DOCUMENT_INTENTS = new Set(["choosing_document", "confirming_document_send"]);

export function pendingSlot(intent: string | null | undefined): PendingSlot {
  return intent && DOCUMENT_INTENTS.has(intent) ? "documents" : "main";
}

export const PENDING_SLOTS: PendingSlot[] = ["main", "documents"];

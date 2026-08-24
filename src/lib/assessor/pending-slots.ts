// Ranhuras (slots) de rascunhos pendentes.
//
// Causa real de um bug: o motor só segurava UM pendente por consultor+canal.
// Uma lista de escolha de documento e uma pergunta de agendamento ficavam a
// competir pela mesma linha — o "não" dado ao agendamento cancelava a lista.
// Cada família de pedidos passa a ter a sua ranhura: uma resposta só resolve
// (ou cancela) o pedido da ranhura a que pertence.

export type PendingSlot = "main" | "documents" | "media" | "script" | "cancel" | "recurrence" | "clarify";

const DOCUMENT_INTENTS = new Set(["choosing_document", "confirming_document_send"]);
// "Guardo o ficheiro ou descarto?" é sempre uma pergunta lateral: não pode
// competir com o assunto principal (proposta de áudio, pergunta do Afonso).
const MEDIA_INTENTS = new Set(["confirm_keep_audio"]);
// "Queres que prepare um guião?" é uma oferta lateral à placa: não pode
// competir com o "queres que te lembre de ligar?" feito na mesma mensagem.
const SCRIPT_INTENTS = new Set(["offer_prospecting_script"]);
// "Qual delas queres desmarcar?" tem ranhura própria: a escolha ("as duas")
// não pode ser roubada por outro rascunho em aberto, nem roubar-lhe o "sim".
const CANCEL_INTENTS = new Set(["choosing_cancel_target"]);
// "Isto repete-se — queres que continue a repetir?" é uma pergunta lateral a
// uma conclusão: o sim/não não pode ser roubado por outro rascunho aberto.
const RECURRENCE_INTENTS = new Set(["confirm_recurrence_continue"]);
// "A que te referes?" — pergunta de esclarecimento do Afonso. Ranhura própria
// e expiração curta: a âncora não pode competir com o assunto principal nem
// sobreviver ao dia (caso "Casa Final B", 30/07).
const CLARIFY_INTENTS = new Set(["open_question"]);

export function pendingSlot(intent: string | null | undefined): PendingSlot {
  if (intent && DOCUMENT_INTENTS.has(intent)) return "documents";
  if (intent && MEDIA_INTENTS.has(intent)) return "media";
  if (intent && SCRIPT_INTENTS.has(intent)) return "script";
  if (intent && CANCEL_INTENTS.has(intent)) return "cancel";
  if (intent && RECURRENCE_INTENTS.has(intent)) return "recurrence";
  if (intent && CLARIFY_INTENTS.has(intent)) return "clarify";
  return "main";
}

export const PENDING_SLOTS: PendingSlot[] = ["main", "documents", "media", "script", "cancel", "recurrence", "clarify"];

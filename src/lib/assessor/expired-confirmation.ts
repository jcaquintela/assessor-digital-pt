// Confirmações que já não estão de pé.
//
// Caso real (13/08): o Afonso perguntou às 19:59 se avançava com o apagamento
// dos áudios; o "Sim" chegou 57 minutos depois e o motor respondeu "Claro. A
// que te referes?". Uma resposta objetiva nunca pode cair no vazio: ou se
// reconhece a pergunta, ou se diz claramente que caducou e se repergunta.
//
// Módulo puro — quem chama é que lê a base de dados.

const DESTRUCTIVE_INTENTS = new Set(["confirm_bulk_archive"]);

export function isDestructiveConfirmation(
  intent: string | null | undefined,
  payload?: Record<string, unknown> | null,
): boolean {
  if (!intent) return false;
  if (!DESTRUCTIVE_INTENTS.has(intent)) return /delete|apagar|remove/i.test(intent);
  return String((payload ?? {}).mode ?? "archive") === "delete";
}

/** Texto para quando a confirmação caducou. Repergunta sempre, nunca cala. */
export function expiredConfirmationReply(
  question: string | null | undefined,
  opts: { destructive?: boolean } = {},
): string {
  const q = String(question ?? "").trim();
  const head = opts.destructive
    ? "Essa confirmação já caducou e, por segurança, não avancei com nada."
    : "Essa confirmação já caducou, por isso não avancei.";
  if (!q) return `${head} Queres que repergunte?`;
  return `${head} Era isto: "${q}" — queres que volte a preparar?`;
}

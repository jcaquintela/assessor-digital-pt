// Duas regras de higiene sobre rascunhos pendentes.
//
// Caso real (29/07, conta da Iolanda):
//  1. "Só registar" — o consultor recusou explicitamente o lembrete, mas o
//     rascunho ficou vivo. Minutos depois, a resposta a OUTRA pergunta
//     ("Lembra hoje às 19:10", sobre a placa de Canelas) caiu nesse rascunho
//     antigo e criou um compromisso ligado ao imóvel errado.
//  2. Uma resposta só pode resolver um pendente RECENTE e ainda em aberto.
//     Se entretanto chegou outro assunto e o assessor fez uma pergunta nova,
//     o pendente velho deixa de ser respondível.
//
// Módulo puro, sem I/O — os motores é que aplicam o efeito.

export const PENDING_ANSWER_WINDOW_MS = 3 * 60_000;

// Uma pergunta de confirmação explícita ("queres que apague os 6 áudios?")
// fica de pé o dia todo: o consultor pode responder uma hora depois, entre
// visitas. O limite duro continua a ser o TTL do rascunho na base de dados.
export const CONFIRM_ANSWER_WINDOW_MS = 24 * 60 * 60_000;

// "Só registar", "guarda só", "sem lembrete", "não é preciso agendar", …
const REGISTER_ONLY_RE = new RegExp(
  [
    // recusa explícita de lembrete/agendamento
    "\\b(?:sem|nada\\s+de)\\s+(?:lembrete|lembretes|alarme|agendamento)\\b",
    "\\bn[ãa]o\\s+(?:é|e)\\s+preciso\\s+(?:lembrete|lembrar|agendar|marcar)\\b",
    "\\bn[ãa]o\\s+(?:precis(?:o|as|a)|quero)\\s+(?:de\\s+)?(?:me\\s+)?(?:lembrete|lembrar|que\\s+me\\s+lembres)\\b",
    "\\bn[ãa]o\\s+(?:marques|agendes|me\\s+lembres)\\b",
    // "só registar" e variantes (com o "só" antes ou depois do verbo)
    "\\b(?:s[óo]|apenas|basta)\\s+(?:para\\s+)?(?:registar|registo|guardar|anotar|apontar|tomar\\s+nota|ficar\\s+registado|mem[óo]ria)\\b",
    "\\b(?:regista|registar|guarda|guardar|anota|anotar|aponta|apontar)\\s+(?:s[óo]|apenas)(?![\\wáàâãéêíóôõúç])",
  ].join("|"),
  "i",
);

export function isRegisterOnly(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length > 160) return false;
  return REGISTER_ONLY_RE.test(t);
}

export interface AnswerablePending {
  current_question?: string | null;
  pending_question?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  status?: string | null;
}

function ts(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resposta em citação directa (reply à mensagem original): sinal forte de
 * que o "sim" pertence àquela pergunta, independentemente do tempo passado.
 */

/**
 * O assessor voltou a perguntar sobre o mesmo assunto por outras palavras?
 * Nesse caso o rascunho tem de passar a guardar a NOVA formulação: é ela a
 * "pergunta relevante mais recente" e é dela que contam as 24 horas.
 */
export function shouldRefreshPendingQuestion(
  pending: AnswerablePending | null | undefined,
  reply: string | null | undefined,
): boolean {
  const text = norm(reply);
  if (!pending || !text.includes("?")) return false;
  if (pending.status !== "pending_confirmation") return false;
  const current = norm(pending.current_question);
  if (current && text.includes(current)) return false;
  return true;
}

export function quotedMatchesPending(
  pending: AnswerablePending | null | undefined,
  quotedText: string | null | undefined,
): boolean {
  const quoted = norm(quotedText);
  if (!pending || quoted.length < 8) return false;
  const question = norm(pending.current_question ?? pending.pending_question);
  if (!question) return false;
  const a = question.slice(0, 120);
  const b = quoted.slice(0, 120);
  return quoted.includes(a) || question.includes(b);
}

/**
 * A pergunta do pendente é mesmo a última coisa que o Afonso disse?
 *
 * Caso real (14/08): estava aberta há dias a pergunta "queres mesmo apagar
 * estes 9 áudios?". A conversa mudou de assunto ("Tens novas funções?") e um
 * "Ok" solto caiu nesse pendente. Um "sim/ok" solto só pode responder à
 * pergunta imediatamente anterior; pendentes esquecidos só por citação.
 */
export function pendingIsLastQuestion(
  pending: AnswerablePending | null | undefined,
  lastAssistantContent: string | null | undefined,
): boolean {
  if (!pending) return false;
  const question = norm(pending.current_question ?? pending.pending_question);
  const lastAssistant = norm(lastAssistantContent);
  if (!question || !lastAssistant) return false;
  return lastAssistant.includes(question);
}

// Um pendente só é respondível por um "sim/não/hora" solto se:
//  • foi criado/actualizado há pouco (janela curta), OU
//  • a pergunta dele ainda é a última coisa que o assessor perguntou.
export function isAnswerablePending(
  pending: AnswerablePending | null | undefined,
  opts: {
    now?: Date;
    lastAssistantContent?: string | null;
    quotedText?: string | null;
    windowMs?: number;
  } = {},
): boolean {
  if (!pending) return false;
  // Citação directa manda sobre o relógio.
  if (quotedMatchesPending(pending, opts.quotedText)) return true;
  const now = (opts.now ?? new Date()).getTime();
  const question = norm(pending.current_question ?? pending.pending_question);
  const lastAssistant = norm(opts.lastAssistantContent);
  // A janela longa (24h) só vale enquanto a pergunta continuar a ser a última
  // coisa que o Afonso disse. Se a conversa seguiu para outro assunto, o
  // pendente fica "esquecido" e só um reply/citação directa lhe pode responder.
  const stillOnScreen = !!question && !!lastAssistant && lastAssistant.includes(question);
  const extended =
    pending.status === "pending_confirmation" && !!question &&
    (stillOnScreen || (!lastAssistant && true));
  const windowMs =
    opts.windowMs ?? (extended ? CONFIRM_ANSWER_WINDOW_MS : PENDING_ANSWER_WINDOW_MS);
  const at = ts(pending.updated_at) ?? ts(pending.created_at);
  if (at === null) return true; // sem data fiável, não bloqueamos
  if (now - at <= windowMs) return true;
  if (question && lastAssistant && lastAssistant.includes(question)) return true;
  return false;
}

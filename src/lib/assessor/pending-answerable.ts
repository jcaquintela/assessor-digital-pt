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
    "\\b(?:regista|registar|guarda|guardar|anota|anotar|aponta|apontar)\\s+(?:s[óo]|apenas)\\b",
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

// Um pendente só é respondível por um "sim/não/hora" solto se:
//  • foi criado/actualizado há pouco (janela curta), OU
//  • a pergunta dele ainda é a última coisa que o assessor perguntou.
export function isAnswerablePending(
  pending: AnswerablePending | null | undefined,
  opts: {
    now?: Date;
    lastAssistantContent?: string | null;
    windowMs?: number;
  } = {},
): boolean {
  if (!pending) return false;
  const now = (opts.now ?? new Date()).getTime();
  const windowMs = opts.windowMs ?? PENDING_ANSWER_WINDOW_MS;
  const at = ts(pending.updated_at) ?? ts(pending.created_at);
  if (at === null) return true; // sem data fiável, não bloqueamos
  if (now - at <= windowMs) return true;

  const question = norm(pending.current_question ?? pending.pending_question);
  const lastAssistant = norm(opts.lastAssistantContent);
  if (question && lastAssistant && lastAssistant.includes(question)) return true;
  return false;
}

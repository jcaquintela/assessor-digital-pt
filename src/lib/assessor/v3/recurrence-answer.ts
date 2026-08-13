// Resposta à pergunta de recorrência — módulo puro (sem I/O).
//
// Quando o consultor dá uma tarefa como concluída e essa tarefa se repete
// automaticamente, o Afonso pergunta se deve continuar a repetir. Fechar hoje
// nunca decide o futuro: a recorrência só é desligada com um "não" explícito.

import { isConfirmation, isRejection } from "../culture/short-answers";
import { normalizeForMatch } from "./cancel-agenda";
import { displayTitle } from "../titles";

export type RecurrenceAnswer = "continue" | "stop" | "unclear";

const STOP_RE = /\b(para|parar|pare|chega|desliga|desligar|termina|terminar|acaba|acabar|cancela|cancelar|nao repit\w*|deixa de repetir|ultima vez|so esta vez)\b/;
const CONTINUE_RE = /\b(continua|continuar|mantem|manter|repete|repetir|segue|deixa ficar|como esta|sim)\b/;

/** Lê a resposta à pergunta "queres que continue a repetir?". */
export function readRecurrenceAnswer(text: string | null | undefined): RecurrenceAnswer {
  const raw = String(text ?? "").trim();
  if (!raw) return "unclear";
  const norm = normalizeForMatch(raw);
  if (STOP_RE.test(norm)) return "stop";
  if (isRejection(raw)) return "stop";
  if (CONTINUE_RE.test(norm)) return "continue";
  if (isConfirmation(raw)) return "continue";
  return "unclear";
}

export function recurrenceKeptReply(routineTitle: string): string {
  return `Certo — ${displayTitle(routineTitle)} continua a repetir-se como até aqui.`;
}

export function recurrenceStoppedReply(routineTitle: string): string {
  return `Desliguei a repetição de ${displayTitle(routineTitle)} — não volta a aparecer sozinho.`;
}

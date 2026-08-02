// Que estado fica um seguimento depois de registado o resultado.
//
// Regra dura: qualquer resultado terminal FECHA o seguimento. Antes só
// "concluido" mexia no status, pelo que "sem efeito" continuava pendente e
// voltava a aparecer em prioridades, agenda e briefings.

export const TERMINAL_OUTCOMES = new Set([
  "concluido",
  "nao_realizado",
  "cancelado",
  "sem_resposta",
]);

/** Resultados que mantêm o seguimento aberto (ainda há trabalho a fazer). */
export const OPEN_OUTCOMES = new Set(["precisa_nova_acao", "adiado"]);

export function isTerminalOutcome(outcome: string): boolean {
  return TERMINAL_OUTCOMES.has(outcome);
}

/** Status a gravar em `follow_ups`, ou null quando o item continua aberto. */
export function statusForOutcome(outcome: string): string | null {
  if (outcome === "concluido") return "Concluído";
  if (isTerminalOutcome(outcome)) return "Arquivado";
  return null;
}

/**
 * Estados de `follow_ups` que significam "terminado". Usado tanto no
 * servidor como no dashboard: um seguimento arquivado ou cancelado não pode
 * voltar a aparecer como prioridade em atraso.
 */
export const DONE_FOLLOW_UP_STATUSES = new Set([
  "concluido", "concluida", "concluído", "concluída",
  "arquivado", "arquivada", "cancelado", "cancelada",
  "done", "completed", "closed", "archived", "cancelled", "canceled",
]);

export function isOpenFollowUpStatus(status?: string | null): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return true;
  return !DONE_FOLLOW_UP_STATUSES.has(s);
}

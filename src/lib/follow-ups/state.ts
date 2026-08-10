// FONTE ÚNICA DE VERDADE: um seguimento está "aberto" ou "fechado".
//
// Antes desta unificação existiam 4+ implementações divergentes (Hoje,
// Seguimentos, Resumo Geral, Prioridades, Proatividade), o que fazia o mesmo
// registo aparecer aberto numa superfície e fechado noutra.
//
// Regra canónica — um seguimento está FECHADO quando qualquer uma é verdade:
//   1. tem `archived_at` preenchido;
//   2. tem um `outcome` terminal (ver TERMINAL_OUTCOMES);
//   3. tem um `status` normalizado na lista de estados terminais.
// Caso contrário está ABERTO. Resultados que pedem trabalho novo
// ("precisa_nova_acao", "adiado") mantêm o item ABERTO de propósito.

import { TERMINAL_OUTCOMES, DONE_FOLLOW_UP_STATUSES } from "@/lib/assessor/outcome-status";
import { isAgendaEvent } from "@/lib/agenda-kind";

export interface FollowUpStateRow {
  status?: unknown;
  outcome?: unknown;
  archived_at?: unknown;
  type?: unknown;
  due_time?: unknown;
}

/** Normalização PT-PT: sem acentos, sem espaços, minúsculas. */
export function normState(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isTerminalOutcomeValue(outcome: unknown): boolean {
  const o = normState(outcome);
  if (!o) return false;
  return TERMINAL_OUTCOMES.has(o);
}

function isTerminalStatusValue(status: unknown): boolean {
  const s = normState(status);
  if (!s) return false;
  // DONE_FOLLOW_UP_STATUSES contém variantes acentuadas; comparamos normalizado.
  for (const done of DONE_FOLLOW_UP_STATUSES) {
    if (normState(done) === s) return true;
  }
  return false;
}

/** Regra canónica de "fechado". Usar SEMPRE esta — nunca comparar strings à mão. */
export function isFollowUpClosed(row: FollowUpStateRow): boolean {
  if (row.archived_at) return true;
  if (isTerminalOutcomeValue(row.outcome)) return true;
  return isTerminalStatusValue(row.status);
}

/** Regra canónica de "aberto". */
export function isFollowUpOpen(row: FollowUpStateRow): boolean {
  return !isFollowUpClosed(row);
}

/** Como se diz ao consultor o estado atual de um seguimento fechado. */
export function followUpStateLabel(row: FollowUpStateRow): string | null {
  const s = normState(row.status);
  if (s === "cancelado" || s === "cancelada" || normState(row.outcome) === "cancelado") return "Cancelado";
  if (row.archived_at || s === "arquivado" || s === "arquivada") return "Arquivado";
  if (s === "concluido" || s === "concluida" || s === "done" || normState(row.outcome) === "concluido") return "Concluído";
  if (isTerminalOutcomeValue(row.outcome)) return "Já com resultado registado";
  return null;
}

/**
 * Evento vs Tarefa — reexportado a partir do classificador único
 * (`src/lib/agenda-kind.ts`) para que exista uma só porta de entrada.
 */
export function isFollowUpEvent(row: FollowUpStateRow): boolean {
  return isAgendaEvent(row.type, row.due_time);
}

export function isFollowUpTask(row: FollowUpStateRow): boolean {
  return !isFollowUpEvent(row);
}

export { isAgendaEvent };
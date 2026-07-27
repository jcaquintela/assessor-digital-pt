// Cultura conversacional — máquina de estados pura.
//
// Módulo sem I/O. Contém apenas a definição dos estados, transições
// permitidas e helpers puros que o `engine.server.ts` (e futuros
// adaptadores) usam para decidir o próximo passo da conversa.
//
// A persistência real vive em `memory.server.ts` (tabelas
// `pending_actions` e `conversation_states`). Este módulo não escreve
// na base de dados — devolve intenções que o chamador executa.

export type ConversationState =
  | "idle"
  | "collecting_information"
  | "awaiting_confirmation"
  | "executing"
  | "completed"
  | "correction_pending"
  | "corrected"
  | "cancelled"
  | "failed"
  | "expired";

// Estados vindos da tabela `pending_actions.status` — mapeamento 1-1
// com esta máquina, exceto `awaiting_confirmation` que na base é
// registado como `pending_confirmation`.
export type PendingActionStatus =
  | "collecting_information"
  | "pending_confirmation"
  | "executing"
  | "executed"
  | "correction_pending"
  | "corrected"
  | "cancelled"
  | "failed"
  | "expired";

export function fromDbStatus(status: PendingActionStatus): ConversationState {
  return status === "pending_confirmation"
    ? "awaiting_confirmation"
    : status === "executed"
      ? "completed"
      : (status as ConversationState);
}

export function toDbStatus(state: ConversationState): PendingActionStatus {
  return state === "awaiting_confirmation"
    ? "pending_confirmation"
    : state === "completed"
      ? "executed"
      : (state as PendingActionStatus);
}

// Transições permitidas (grafo). Cada chave é o estado de partida.
const TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  idle: ["collecting_information", "awaiting_confirmation"],
  collecting_information: [
    "collecting_information",
    "awaiting_confirmation",
    "cancelled",
    "expired",
  ],
  awaiting_confirmation: [
    "executing",
    "correction_pending",
    "cancelled",
    "collecting_information",
    "expired",
  ],
  executing: ["completed", "failed"],
  completed: ["idle"],
  correction_pending: ["awaiting_confirmation", "corrected", "cancelled"],
  corrected: ["awaiting_confirmation", "completed", "idle"],
  cancelled: ["idle"],
  failed: ["awaiting_confirmation", "idle"],
  expired: ["idle"],
};

export function canTransition(from: ConversationState, to: ConversationState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// Eventos aplicáveis à máquina — nomes independentes do canal.
export type MachineEvent =
  | "user_confirmed"
  | "user_rejected"
  | "user_corrected"
  | "slot_filled_partial"
  | "slot_filled_complete"
  | "execution_ok"
  | "execution_failed"
  | "cleared"
  | "expired";

export function getNextState(
  from: ConversationState,
  event: MachineEvent,
): ConversationState {
  switch (event) {
    case "user_confirmed":
      return from === "awaiting_confirmation" || from === "corrected"
        ? "executing"
        : from;
    case "user_rejected":
      return "cancelled";
    case "user_corrected":
      return "correction_pending";
    case "slot_filled_partial":
      return "collecting_information";
    case "slot_filled_complete":
      return "awaiting_confirmation";
    case "execution_ok":
      return "completed";
    case "execution_failed":
      return "failed";
    case "expired":
      return "expired";
    case "cleared":
      return "idle";
    default:
      return from;
  }
}

// ------------------------------------------------------------------
// Regras invariantes
// ------------------------------------------------------------------

export interface PendingSnapshot {
  id: string;
  status: PendingActionStatus;
  expires_at: string | null;
  created_at?: string;
}

export function shouldExpireState(
  pending: PendingSnapshot | null,
  now: Date = new Date(),
): boolean {
  if (!pending || !pending.expires_at) return false;
  const ts = new Date(pending.expires_at).getTime();
  return Number.isFinite(ts) && ts < now.getTime();
}

export function isPendingActionValid(
  pending: PendingSnapshot | null,
  now: Date = new Date(),
): boolean {
  if (!pending) return false;
  if (shouldExpireState(pending, now)) return false;
  return [
    "collecting_information",
    "pending_confirmation",
    "correction_pending",
  ].includes(pending.status);
}

// Após conclusão/cancelamento/expiração, o estado da conversa volta a
// idle e o pending activo é removido — o chamador aplica em
// `conversation_states` (upsert com pendingActionId=null).
export function clearCompletedState(state: ConversationState): ConversationState {
  return state === "completed" ||
    state === "cancelled" ||
    state === "expired" ||
    state === "failed"
    ? "idle"
    : state;
}

// Aplica uma correção estruturada a um snapshot de entidades. Devolve o
// novo payload — o chamador é quem persiste e transita para
// `correction_pending` → `awaiting_confirmation`.
export function applyCorrectionToState<T extends Record<string, unknown>>(
  entities: T,
  correction: { date?: string | null; time?: string | null; person_name?: string | null },
): T {
  const next: Record<string, unknown> = { ...entities };
  if (correction.date) next.date = correction.date;
  if (correction.time) next.start_time = correction.time;
  if (correction.person_name) next.person_name = correction.person_name;
  return next as T;
}
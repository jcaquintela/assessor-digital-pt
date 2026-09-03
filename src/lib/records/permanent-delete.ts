// Eliminação permanente — regras puras, partilhadas pelo servidor e pela UI.
//
// Esta é a operação de maior risco do produto: não há reciclagem, não há
// reposição. Por isso a porta é estreita de propósito:
//   1. só a partir da vista de arquivados (o registo tem de estar arquivado);
//   2. o consultor tem de marcar que compreende que não é recuperável;
//   3. o botão só fica ativo 3 segundos depois de o aviso aparecer.

export type PermanentDeleteType = "follow_up" | "miscellaneous";

/** Tempo mínimo entre ver o aviso e poder confirmar. */
export const PERMANENT_DELETE_DELAY_MS = 3000;

export interface DeletableRow {
  archived_at?: unknown;
  status?: unknown;
}

/** Só um registo já arquivado pode ser eliminado para sempre. */
export function isArchivedForDelete(type: PermanentDeleteType, row: DeletableRow): boolean {
  const status = String(row?.status ?? "").trim().toLowerCase();
  if (type === "miscellaneous") return status === "archived";
  return !!row?.archived_at || status === "arquivado" || status === "arquivada";
}

/** A confirmação do modal está completa? */
export function canConfirmPermanentDelete(input: {
  acknowledged: boolean;
  elapsedMs: number;
}): boolean {
  return input.acknowledged === true && input.elapsedMs >= PERMANENT_DELETE_DELAY_MS;
}

export const NOT_ARCHIVED_MESSAGE =
  "Só podes eliminar definitivamente um registo já arquivado. Arquiva primeiro.";

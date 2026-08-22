// Convenção de arquivado para DIVERSOS: a fonte única de verdade é
// `miscellaneous_items.status`. A coluna `archived_at` nunca foi preenchida por
// nenhum caminho de escrita (0 registos), por isso não é usada em leitura
// nenhuma — quem arquiva escreve `status = 'archived'`, quem elimina escreve
// `status = 'deleted'`.

export type MiscStatus = "inbox" | "classified" | "reviewed" | "archived" | "deleted";

export interface MiscStatusRow {
  status?: string | null;
}

export const isMiscArchived = (r: MiscStatusRow) => r.status === "archived";
export const isMiscDeleted = (r: MiscStatusRow) => r.status === "deleted";
/** Conta para o "por tratar" do resumo de /hoje. */
export const isMiscInbox = (r: MiscStatusRow) => r.status === "inbox";

export type MiscTab = "recentes" | "tratar" | "classificados" | "arquivados";

/** Único sítio que decide que separador mostra que nota. */
export function matchesMiscTab(r: MiscStatusRow, tab: MiscTab): boolean {
  if (isMiscDeleted(r)) return false;
  if (tab === "tratar") return isMiscInbox(r);
  if (tab === "classificados") return r.status === "classified" || r.status === "reviewed";
  if (tab === "arquivados") return isMiscArchived(r);
  return !isMiscArchived(r);
}

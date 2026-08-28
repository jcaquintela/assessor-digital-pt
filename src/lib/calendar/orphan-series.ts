// Séries recorrentes órfãs do Outlook.
//
// Antes da correção de recorrência (25/08) o `seriesMaster` era importado como
// se fosse um compromisso normal. Depois da correção deixámos de o importar —
// mas as linhas antigas ficaram na agenda, congeladas na data da 1ª ocorrência
// (muitas vezes meses atrás), e as ocorrências futuras nunca chegaram: o delta
// do Outlook só reenvia o que mudou, e estas séries não mudaram.
//
// Resultado silencioso: agenda incompleta, sem erro de sync e sem last_error.
//
// Este módulo tem a parte pura (que linhas são candidatas a master órfão), para
// poder ser testada sem tocar no Microsoft Graph.

import { isFollowUpOpen } from "@/lib/follow-ups/state";

export interface ImportedEventRow {
  id: string;
  title: string | null;
  due_date: string | null;
  status?: string | null;
  archived_at?: string | null;
  external_reference?: string | null;
}

// Estados terminais vêm da fonte única (isFollowUpOpen) — nunca uma lista local.

/**
 * Candidatos a master órfão: compromisso importado do Outlook, ainda aberto,
 * mas com data no passado. Um evento único passado é inofensivo — só se torna
 * órfão se o Graph confirmar que o id é um `seriesMaster` (passo seguinte).
 */
export function orphanMasterCandidates(
  rows: ImportedEventRow[],
  now: Date = new Date(),
  limit = 40,
): ImportedEventRow[] {
  const nowMs = now.getTime();
  return rows
    .filter((r) => !!r.external_reference)
    .filter((r) => !r.archived_at)
    .filter((r) => isFollowUpOpen({ status: r.status, archived_at: r.archived_at }))
    .filter((r) => {
      const t = r.due_date ? new Date(r.due_date).getTime() : NaN;
      return Number.isFinite(t) && t < nowMs;
    })
    .slice(0, limit);
}

/** Janela a reimportar por `calendarView` depois de limpar os masters. */
export function backfillWindow(now: Date = new Date(), aheadDays = 180): { start: string; end: string } {
  return {
    start: new Date(now.getTime() - 86_400_000).toISOString(),
    end: new Date(now.getTime() + aheadDays * 86_400_000).toISOString(),
  };
}

// Validade dos avisos proativos.
//
// Bug de 14/09/2026: um aviso de pré-evento escrito no domingo às 07:45 ficou
// em fila (o envio está desligado ao domingo e fora das 9h–20h) e saiu na
// segunda às 09:00 com o texto congelado — "daqui a 75 min" 25 horas depois.
// O padrão era sistemático: resumos nocturnos com 9h de atraso, avisos de fim
// de semana com 33–38h.
//
// Regra: um aviso com prazo morre em silêncio quando o momento a que se refere
// já passou. Aqui ficam as funções puras; o dispatcher aplica-as.

import { lisbonYmd, ymdDiffDays } from "../lisbon-day";

export const PRE_EVENT_DEDUPE_PREFIX = "supreme_pre_event:";

/** Dia de calendário (YYYY-MM-DD) embutido numa dedupe_key terminada em :YYYYMMDD. */
export function dayKeyFromDedupe(dedupeKey: string | null | undefined): string | null {
  const m = /:(\d{4})(\d{2})(\d{2})$/.exec(String(dedupeKey ?? "").trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * O aviso já perdeu a validade à hora do envio?
 *
 * Dois critérios, ambos em dias de calendário de Lisboa:
 * - a dedupe_key refere um dia que não é hoje (briefing diário, resumo de fim
 *   de dia, digest de oportunidades, conflitos, aviso de teto, ...);
 * - o aviso nasceu num dia anterior (cobre as chaves sem data, como o
 *   pré-evento e o "como correu?").
 */
export function isNudgeExpired(
  row: { dedupe_key?: string | null; created_at?: string | null },
  now: Date = new Date(),
): boolean {
  const today = lisbonYmd(now);
  const keyed = dayKeyFromDedupe(row.dedupe_key);
  if (keyed && keyed !== today) return true;
  const created = row.created_at ? lisbonYmd(row.created_at) : "";
  if (created && ymdDiffDays(today, created) > 0) return true;
  return false;
}

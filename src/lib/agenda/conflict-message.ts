// Como o Afonso conta um conflito de horário. PT-PT, sem linguagem de erro:
// nomeia os dois compromissos, a hora da sobreposição, e termina com uma
// pergunta de ação. O consultor decide.

import { lisbonYmd, ymdDiffDays, lisbonHhMm } from "@/lib/assessor/lisbon-day";
import type { ConflictPair } from "./conflicts";

const WEEKDAYS = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

/** "hoje", "amanhã", "na quinta-feira" ou "a 12/09". */
export function relativeDayLabel(whenMs: number, now: Date = new Date()): string {
  const diff = ymdDiffDays(lisbonYmd(whenMs), lisbonYmd(now));
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff > 1 && diff <= 6) {
    const ymd = lisbonYmd(whenMs);
    const wd = new Date(`${ymd}T12:00:00Z`).getUTCDay();
    return `na ${WEEKDAYS[wd]}`;
  }
  const [y, m, d] = lisbonYmd(whenMs).split("-");
  return `a ${d}/${m}${diff > 300 ? `/${y}` : ""}`;
}

export function conflictMessage(pair: ConflictPair, now: Date = new Date()): string {
  const dia = relativeDayLabel(pair.overlapStartMs, now);
  const hora = lisbonHhMm(pair.overlapStartMs);
  return `Tens dois compromissos ao mesmo tempo ${dia} às ${hora}: “${pair.a.title}” e “${pair.b.title}”. Queres remarcar algum?`;
}

export function conflictReason(pair: ConflictPair, now: Date = new Date()): string {
  const dia = relativeDayLabel(pair.overlapStartMs, now);
  const hora = lisbonHhMm(pair.overlapStartMs);
  return `“${pair.a.title}” e “${pair.b.title}” sobrepõem-se ${dia} às ${hora}.`;
}

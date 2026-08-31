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

/** "Level-Up 2026 (10:00–11:00)" — a hora real do compromisso, não a da colisão. */
export function eventLabel(ev: { title: string; startMs: number; endMs: number }): string {
  return `“${ev.title}” (${lisbonHhMm(ev.startMs)}–${lisbonHhMm(ev.endMs)})`;
}

export function conflictMessage(pair: ConflictPair, now: Date = new Date()): string {
  const dia = relativeDayLabel(pair.a.startMs, now);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} tens ${eventLabel(pair.a)} e ${eventLabel(
    pair.b,
  )} — sobrepõem-se. Queres remarcar algum?`;
}

export function conflictReason(pair: ConflictPair, now: Date = new Date()): string {
  const dia = relativeDayLabel(pair.a.startMs, now);
  return `${eventLabel(pair.a)} e ${eventLabel(pair.b)} sobrepõem-se ${dia}.`;
}

/** Aviso informativo de folga curta — nunca vira nudge de conflito. */
export function tightGapMessage(gap: { a: { title: string; startMs: number; endMs: number }; b: { title: string; startMs: number; endMs: number }; gapMinutes: number }): string {
  const folga =
    gap.gapMinutes <= 0
      ? "ficam encostados, sem folga nenhuma"
      : `só tens ${gap.gapMinutes} min entre um e outro`;
  return `Atenção: ${eventLabel(gap.a)} e ${eventLabel(gap.b)} — ${folga}.`;
}

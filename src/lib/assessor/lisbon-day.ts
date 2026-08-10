// Datas de agenda são dias de calendário em Lisboa, não instantes UTC.
//
// Bug que isto corrige: comparávamos a meia-noite UTC do dia de Lisboa com o
// timestamp bruto do evento. No Verão (UTC+1) um evento de ontem às 22h
// (21h UTC) ficava "depois" da meia-noite UTC de hoje e era anunciado como
// "compromisso de hoje". Aqui comparamos sempre dia-de-calendário com
// dia-de-calendário.

const YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia de calendário em Lisboa (YYYY-MM-DD) de um instante ou data solta. */
export function lisbonYmd(value: string | number | Date): string {
  if (typeof value === "string") {
    // "2026-08-09" (date-only) não tem instante: é já o dia pretendido.
    const m = /^(\d{4}-\d{2}-\d{2})(?:$|[T ](\d{2}):)/.exec(value.trim());
    if (m && m[2] === undefined) return m[1]!;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return YMD_FMT.format(d);
}

/** Diferença em dias de calendário entre dois YMD (a - b). */
export function ymdDiffDays(a: string, b: string): number {
  if (!a || !b) return 0;
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  const ta = Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!);
  const tb = Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!);
  return Math.round((ta - tb) / 864e5);
}

/** Instante ISO do fim do dia de Lisboa (limite superior seguro para queries). */
export function endOfLisbonDayIso(now: Date = new Date()): string {
  const ymd = lisbonYmd(now);
  const [y, m, d] = ymd.split("-").map(Number);
  // Meia-noite de amanhã em Lisboa, obtida por aproximação + correcção do fuso.
  const guess = new Date(Date.UTC(y!, m! - 1, d! + 1, 0, 0, 0));
  const offsetMs = guess.getTime() - lisbonInstantOfLocalMidnight(guess);
  return new Date(guess.getTime() + offsetMs - 1).toISOString();
}

function lisbonInstantOfLocalMidnight(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return Date.UTC(
    Number(m.year), Number(m.month) - 1, Number(m.day),
    Number(hour), Number(m.minute), Number(m.second),
  );
}

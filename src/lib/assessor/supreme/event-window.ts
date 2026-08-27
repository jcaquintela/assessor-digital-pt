// Janela temporal de um compromisso — módulo puro (sem BD, sem rede).
//
// Bug que isto corrige: às 15:30 o dashboard mostrava "Preparar o compromisso
// das 10:00". A sugestão de preparação só faz sentido ANTES do compromisso.
// Um compromisso com hora tem de ser comparado com a hora atual, não apenas
// com o dia de calendário.
import { lisbonYmd, ymdDiffDays, lisbonInstant } from "@/lib/assessor/lisbon-day";

/** Sem duração na base de dados, assume-se uma hora de compromisso. */
export const DEFAULT_EVENT_MINUTES = 60;

export interface EventTiming {
  due_date?: unknown;
  due_time?: unknown;
}

function ymdOf(value: unknown): string {
  if (value == null) return "";
  return lisbonYmd(value as string | number | Date);
}

/** Instante (ms) de uma hora local de Lisboa num dado dia de calendário. */
function lisbonInstant(ymd: string, hh: number, mm: number): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Descobre o desvio real (0 ou -60min no Verão) formatando o palpite.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(guess));
  const p: Record<string, string> = {};
  for (const q of parts) p[q.type] = q.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  const asLocal = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(hour), Number(p.minute), Number(p.second),
  );
  return guess + (guess - asLocal);
}

function parseHhmm(value: unknown): { hh: number; mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

/** Início e fim do compromisso em ISO, quando há hora marcada. */
export function eventWindow(
  row: EventTiming,
  minutes = DEFAULT_EVENT_MINUTES,
): { startIso: string | null; endIso: string | null } {
  const ymd = ymdOf(row.due_date);
  const hm = parseHhmm(row.due_time);
  if (!ymd || !hm) return { startIso: null, endIso: null };
  const start = lisbonInstant(ymd, hm.hh, hm.mm);
  if (!Number.isFinite(start)) return { startIso: null, endIso: null };
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + minutes * 60_000).toISOString(),
  };
}

/**
 * O compromisso já terminou?
 *
 * - Com hora: fim (início + duração) já passou.
 * - Sem hora: só é passado quando o dia de calendário de Lisboa já passou.
 */
export function isEventOver(row: EventTiming, now: Date = new Date()): boolean {
  const ymd = ymdOf(row.due_date);
  if (!ymd) return false;
  const dayDiff = ymdDiffDays(lisbonYmd(now), ymd);
  if (dayDiff > 0) return true;
  if (dayDiff < 0) return false;
  const { endIso } = eventWindow(row);
  if (!endIso) return false;
  return new Date(endIso).getTime() <= now.getTime();
}

/** Versão para o browser: o cartão já tem a janela calculada pelo servidor. */
export function isWindowOver(endIso: string | null | undefined, now: Date = new Date()): boolean {
  if (!endIso) return false;
  const t = new Date(endIso).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

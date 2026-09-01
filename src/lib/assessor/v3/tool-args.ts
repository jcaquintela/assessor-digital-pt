// Normalização de argumentos vindos do modelo, antes da validação Zod.
//
// Sete registos reais em Diversos vieram de `invalid_args`: o motor percebeu
// o pedido, escolheu a ferramenta certa e resolveu a entidade — e a chamada
// foi recusada pelo schema por um detalhe de formato. Isso não é falha de
// interpretação, é mapeamento LLM→schema. Este módulo é puro e testável.

import { lisbonYmd, lisbonHhMm } from "../lisbon-day";

/** Dia e hora em Europe/Lisbon (YYYY-MM-DD, HH:MM) — fonte única em lisbon-day.ts. */
export function lisbonNow(now: Date = new Date()): { date: string; time: string } {
  return { date: lisbonYmd(now), time: lisbonHhMm(now) };
}

/** "9:30", "9h30", "09.30", "9 h 30" → "09:30". Devolve null se não for hora. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  const m = raw.match(/^(\d{1,2})\s*(?:[:h.,]\s*(\d{1,2}))?\s*(?:h(?:oras?)?)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (!Number.isFinite(h) || h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "2026-7-9" → "2026-07-09". Devolve null se não for data ISO plausível. */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

const DATE_FIELD: Record<string, { date: string; time: string }> = {
  create_event: { date: "date", time: "start_time" },
  create_follow_up: { date: "due_date", time: "due_time" },
  create_reminder: { date: "due_date", time: "due_time" },
};

/**
 * O consultor responde só com a hora ("09:30") a uma pergunta do Afonso
 * ("para quando queres o lembrete?"). O modelo passa a hora sem data e o
 * schema rejeita. A data implícita é hoje — ou amanhã, se a hora já passou.
 * A proposta é sempre confirmada pelo consultor, por isso assumir hoje é
 * seguro e muito melhor do que perder o pedido.
 */
/** Rotinas: "18h", "18h30" → "18:00"/"18:30" antes do schema HH:MM. */
const TIME_ONLY_TOOLS = new Set(["create_routine", "update_routine"]);

export function normalizeRoutineTime(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!TIME_ONLY_TOOLS.has(name)) return args;
  const t = normalizeTime(args["time_of_day"]);
  return t ? { ...args, time_of_day: t } : args;
}

export function fillMissingDate(
  name: string,
  args: Record<string, unknown>,
  now: Date = new Date(),
): Record<string, unknown> {
  const fields = DATE_FIELD[name];
  if (!fields) return args;
  const a = { ...args };

  const time = normalizeTime(a[fields.time]);
  if (time) a[fields.time] = time;

  const given = normalizeDate(a[fields.date]);
  if (given) { a[fields.date] = given; return a; }
  // Sem hora nem data não inventamos nada: o schema recusa e o motor pergunta.
  if (!time) return a;

  const nowLisbon = lisbonNow(now);
  a[fields.date] = time >= nowLisbon.time ? nowLisbon.date : addDay(nowLisbon.date);
  return a;
}

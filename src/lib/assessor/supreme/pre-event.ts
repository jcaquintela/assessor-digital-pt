// Aviso de pré-evento ("daqui a ~1 hora tens X").
//
// Regras aprendidas com o bug de 14/08/2026:
// - O tempo escrito na mensagem é SEMPRE calculado no momento do envio; nunca
//   um texto fixo ("daqui a uma hora") desligado da realidade.
// - A janela usa a hora real de início (due_date + due_time em Lisboa), não o
//   `due_date` cru — senão o aviso saía à hora exacta do compromisso.
// - Compromissos de negócio recebem a Cartela de Briefing aos 15 min; para
//   esses, este aviso mais antigo cala-se, para não parecerem duplicados.

import {
  eventStartMs,
  isBriefingEligible,
  type BriefingEvent,
} from "../proactive/meeting-briefing";

export const PRE_EVENT_MIN_MINUTES = 45;
export const PRE_EVENT_MAX_MINUTES = 75;
/** Janela em que a cartela e um lembrete clássico seriam vistos como duplicado. */
export const REMINDER_SUPPRESS_MINUTES = 20;

export function minutesUntilEvent(
  ev: Pick<BriefingEvent, "due_date" | "due_time">,
  nowMs: number,
): number {
  const start = eventStartMs(ev);
  if (!Number.isFinite(start)) return NaN;
  return Math.round((start - nowMs) / 60_000);
}

/** Está na janela dos 45–75 min e não é caso de cartela? */
export function isPreEventDue(ev: BriefingEvent, nowMs: number): boolean {
  // Compromisso de negócio → é a cartela dos 15 min que fala.
  if (isBriefingEligible(ev)) return false;
  const mins = minutesUntilEvent(ev, nowMs);
  if (!Number.isFinite(mins)) return false;
  return mins >= PRE_EVENT_MIN_MINUTES && mins <= PRE_EVENT_MAX_MINUTES;
}

/** "daqui a 52 min" / "daqui a 2 horas" — sempre o tempo real. */
export function humanTimeUntil(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 90) return `daqui a ${m} min`;
  const h = Math.round(m / 60);
  return h === 1 ? "daqui a 1 hora" : `daqui a ${h} horas`;
}

export function formatPreEventNudge(
  ev: BriefingEvent,
  personName: string | null,
  nowMs: number,
): string {
  const when = humanTimeUntil(minutesUntilEvent(ev, nowMs));
  const who = personName ? ` com ${personName}` : "";
  return `${when.charAt(0).toUpperCase()}${when.slice(1)} tens ${String(ev.title).trim()}${who}. Queres que te prepare o contexto?`;
}

/** O lembrete clássico cala-se quando a cartela acabou de sair para o mesmo evento. */
export function shouldSuppressReminder(
  briefingSentAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (!briefingSentAt) return false;
  const t = new Date(briefingSentAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Math.abs(nowMs - t) <= REMINDER_SUPPRESS_MINUTES * 60_000;
}

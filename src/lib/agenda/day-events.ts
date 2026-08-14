// Fonte ÚNICA dos compromissos do dia para os widgets do dashboard.
//
// Bug que isto corrige: às 15:30 os widgets ainda mostravam os compromissos das
// 10:00, 11:00 e 12:00 como "próximos". Cada widget tinha a sua própria seleção.
// Agora todos leem daqui — e a hora é sempre a de Lisboa.
//
// Módulo puro: sem BD, sem rede, sem estado.

import { lisbonYmd, ymdDiffDays } from "@/lib/assessor/lisbon-day";
import { eventWindow, DEFAULT_EVENT_MINUTES } from "@/lib/assessor/supreme/event-window";

export interface DayEvent {
  id: string;
  title: string;
  /** "HH:MM" em Lisboa, ou null quando é um compromisso sem hora marcada. */
  time: string | null;
  /** Dia de calendário "YYYY-MM-DD" em Lisboa. */
  date: string;
  /** Duração em minutos, quando conhecida (por omissão 60). */
  minutes?: number | null;
  type?: string | null;
  personId?: string | null;
  propertyId?: string | null;
}

const LAST = "99:99";

function byTime(a: DayEvent, b: DayEvent): number {
  return (a.time ?? LAST).localeCompare(b.time ?? LAST);
}

/** O compromisso já terminou (fim = início + duração)? Sem hora, dura o dia todo. */
export function isOver(ev: DayEvent, now: Date): boolean {
  const diff = ymdDiffDays(lisbonYmd(now), ev.date);
  if (diff > 0) return true;
  if (diff < 0) return false;
  if (!ev.time) return false; // dia inteiro: só termina quando o dia muda
  const { endIso } = eventWindow(
    { due_date: ev.date, due_time: ev.time },
    ev.minutes ?? DEFAULT_EVENT_MINUTES,
  );
  if (!endIso) return false;
  return new Date(endIso).getTime() <= now.getTime();
}

/** Compromissos de hoje (passados + futuros), ordenados por hora. */
export function todayEvents(events: readonly DayEvent[], now: Date = new Date()): DayEvent[] {
  const today = lisbonYmd(now);
  return events.filter((e) => e.date === today).sort(byTime);
}

/** Total de compromissos de hoje — conta o dia inteiro, não muda ao longo do dia. */
export function todayEventCount(events: readonly DayEvent[], now: Date = new Date()): number {
  return todayEvents(events, now).length;
}

/** Compromissos de hoje que ainda não terminaram, ordenados por hora. */
export function upcomingEvents(events: readonly DayEvent[], now: Date = new Date()): DayEvent[] {
  return todayEvents(events, now).filter((e) => !isOver(e, now));
}

/** Próximo compromisso de hoje (ou o que está a decorrer), ou null. */
export function nextEvent(events: readonly DayEvent[], now: Date = new Date()): DayEvent | null {
  return upcomingEvents(events, now)[0] ?? null;
}

/** Primeiro compromisso de amanhã, para quando já não há nada hoje. */
export function firstTomorrowEvent(
  events: readonly DayEvent[],
  now: Date = new Date(),
): DayEvent | null {
  const today = lisbonYmd(now);
  return events.filter((e) => ymdDiffDays(e.date, today) === 1).sort(byTime)[0] ?? null;
}

export interface AgendaView {
  /** Contagem do dia inteiro (cabeçalho e cartão "Compromissos hoje"). */
  todayCount: number;
  /** Lista de "Próximos compromissos". */
  upcoming: DayEvent[];
  next: DayEvent | null;
  tomorrow: DayEvent | null;
  /** Subtítulo do cartão de agenda, já em PT-PT. */
  cardMeta: string;
  /** Texto do bloco "Próximos compromissos" quando não há nada por vir hoje. */
  emptyLabel: string;
}

/** Vista completa da agenda do dia — tudo o que os widgets precisam, num sítio só. */
export function buildAgendaView(events: readonly DayEvent[], now: Date = new Date()): AgendaView {
  const todayCount = todayEventCount(events, now);
  const upcoming = upcomingEvents(events, now);
  const next = upcoming[0] ?? null;
  const tomorrow = firstTomorrowEvent(events, now);

  const cardMeta = next
    ? `${next.time ? `${next.time} — ` : ""}${next.title}`
    : todayCount > 0
      ? "Todos concluídos"
      : "nada marcado";

  const emptyLabel =
    todayCount > 0 ? "Sem mais compromissos hoje." : "Não tens compromissos para hoje.";

  return { todayCount, upcoming, next, tomorrow, cardMeta, emptyLabel };
}

/** "Amanhã, 09:30 — Visita ao T3" */
export function tomorrowLabel(ev: DayEvent | null): string | null {
  if (!ev) return null;
  return `Amanhã${ev.time ? `, ${ev.time}` : ""} — ${ev.title}`;
}

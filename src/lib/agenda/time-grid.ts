// Layout da grelha de horas da Agenda (vista Semana/Dia, estilo Google Calendar).
//
// Módulo puro: só calcula posições. Nada de BD, rede ou React.
//
// Notas de dados: os compromissos só guardam hora de início (`due_time`); a
// duração assumida é DEFAULT_EVENT_MINUTES (60). Compromissos sem hora não
// entram na grelha — vão para a secção "sem hora marcada".

import { DEFAULT_EVENT_MINUTES } from "@/lib/assessor/supreme/event-window";
import type { AgendaEvent } from "./views";

/** Primeira e última hora visíveis por omissão (com scroll para o resto do dia). */
export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 22;
/** Altura de uma hora, em px. Linhas de meia hora dentro de cada hora. */
export const HOUR_HEIGHT = 56;

export interface PlacedEvent {
  event: AgendaEvent;
  /** Minutos desde a meia-noite. */
  startMinutes: number;
  minutes: number;
  /** Coluna dentro do grupo de sobreposição (0-based) e nº total de colunas. */
  column: number;
  columns: number;
}

/** "HH:MM" → minutos desde a meia-noite; null quando inválido ou ausente. */
export function minutesOfDay(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function eventMinutes(e: AgendaEvent): number {
  const n = Number(e.minutes ?? DEFAULT_EVENT_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EVENT_MINUTES;
}

/** Compromissos sem hora marcada — mostrados fora da grelha. */
export function untimed(events: readonly AgendaEvent[]): AgendaEvent[] {
  return events.filter((e) => minutesOfDay(e.time) === null);
}

/**
 * Posiciona os compromissos com hora: ordena por início e, para cada grupo que
 * se cruza no tempo, distribui em colunas lado a lado (nunca esconde nem
 * empilha). Grupo = cadeia de eventos que se sobrepõem.
 */
export function placeDay(events: readonly AgendaEvent[]): PlacedEvent[] {
  const timed = events
    .map((event) => {
      const startMinutes = minutesOfDay(event.time);
      return startMinutes === null ? null : { event, startMinutes, minutes: eventMinutes(event) };
    })
    .filter((x): x is { event: AgendaEvent; startMinutes: number; minutes: number } => !!x)
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        a.minutes - b.minutes ||
        a.event.id.localeCompare(b.event.id),
    );

  const out: PlacedEvent[] = [];
  let group: PlacedEvent[] = [];
  let groupEnd = -1;

  const flush = () => {
    const columns = group.reduce((max, p) => Math.max(max, p.column + 1), 0);
    for (const p of group) p.columns = columns;
    out.push(...group);
    group = [];
    groupEnd = -1;
  };

  for (const item of timed) {
    if (group.length && item.startMinutes >= groupEnd) flush();
    // Primeira coluna livre neste instante.
    const busy = new Set(
      group.filter((p) => p.startMinutes + p.minutes > item.startMinutes).map((p) => p.column),
    );
    let column = 0;
    while (busy.has(column)) column += 1;
    group.push({ ...item, column, columns: column + 1 });
    groupEnd = Math.max(groupEnd, item.startMinutes + item.minutes);
  }
  if (group.length) flush();
  return out;
}

/** Janela de horas a mostrar: a padrão, alargada para caber os eventos do dia. */
export function hourRange(events: readonly AgendaEvent[]): { from: number; to: number } {
  let from = GRID_START_HOUR;
  let to = GRID_END_HOUR;
  for (const e of events) {
    const start = minutesOfDay(e.time);
    if (start === null) continue;
    from = Math.min(from, Math.floor(start / 60));
    to = Math.max(to, Math.ceil((start + eventMinutes(e)) / 60));
  }
  return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
}

/** Posição em px do bloco, dado o início da janela. */
export function blockGeometry(p: PlacedEvent, fromHour: number): { top: number; height: number } {
  const top = ((p.startMinutes - fromHour * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(22, (p.minutes / 60) * HOUR_HEIGHT - 2);
  return { top, height };
}

/** Minutos do clique numa coluna do dia → "HH:MM" arredondado a 30 min. */
export function slotTimeFromOffset(offsetY: number, fromHour: number): string {
  const raw = fromHour * 60 + (offsetY / HOUR_HEIGHT) * 60;
  const snapped = Math.max(0, Math.min(23 * 60 + 30, Math.round(raw / 30) * 30));
  const h = Math.floor(snapped / 60);
  const m = snapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

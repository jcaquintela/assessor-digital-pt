// Seletor central dos períodos da Agenda (Hoje / Semana / Mês / Lista).
//
// Regra: TODAS as vistas leem daqui, a partir do mesmo conjunto de eventos já
// usado pela vista Hoje (src/lib/agenda/day-events.ts). Nada de queries
// paralelas — foi assim que os widgets de horário divergiram no passado.
//
// Módulo puro: sem BD, sem rede, sem estado.

import type { DayEvent } from "./day-events";

export interface AgendaEvent extends DayEvent {
  /** "negocio" | "interno" — classificação já calculada noutro sítio. */
  eventClass?: string | null;
}

export type AgendaViewMode = "hoje" | "semana" | "mes" | "lista";

const LAST = "99:99";

export function byDateTime(a: AgendaEvent, b: AgendaEvent): number {
  return a.date === b.date
    ? (a.time ?? LAST).localeCompare(b.time ?? LAST)
    : a.date.localeCompare(b.date);
}

/** Soma dias a uma chave "YYYY-MM-DD", sem tocar em fusos. */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

/** Segunda-feira da semana da chave dada (semana PT: Seg → Dom). */
export function startOfWeekKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0=Dom
  const back = (dow + 6) % 7;
  return addDaysKey(key, -back);
}

/** As 7 chaves da semana que começa em `startKey`. */
export function weekKeys(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysKey(startKey, i));
}

/** Eventos agrupados por dia, ordenados por hora dentro de cada dia. */
export function groupByDay(events: readonly AgendaEvent[]): Map<string, AgendaEvent[]> {
  const map = new Map<string, AgendaEvent[]>();
  for (const e of [...events].sort(byDateTime)) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}

/** Nº de compromissos por dia — indicador da grelha mensal. */
export function countsByDay(events: readonly AgendaEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) map.set(e.date, (map.get(e.date) ?? 0) + 1);
  return map;
}

export interface DayGroup {
  key: string;
  events: AgendaEvent[];
}

/** Só os dias com compromissos, em ordem cronológica. */
export function dayGroups(events: readonly AgendaEvent[], keys: readonly string[]): DayGroup[] {
  const map = groupByDay(events);
  return keys
    .map((key) => ({ key, events: map.get(key) ?? [] }))
    .filter((g) => g.events.length > 0);
}

/** Vista Semana: os 7 dias, mesmo os vazios (a grelha mostra-os na mesma). */
export function weekGroups(events: readonly AgendaEvent[], startKey: string): DayGroup[] {
  const map = groupByDay(events);
  return weekKeys(startKey).map((key) => ({ key, events: map.get(key) ?? [] }));
}

/**
 * Vista Lista: compromissos de hoje em diante, agrupados por dia, limitados a
 * uma janela de dias (por omissão 30, com "carregar mais" a aumentar a janela).
 */
export function listGroups(
  events: readonly AgendaEvent[],
  todayKey: string,
  days = 30,
): DayGroup[] {
  const limit = addDaysKey(todayKey, days);
  const within = events.filter((e) => e.date >= todayKey && e.date < limit);
  const keys = [...new Set(within.map((e) => e.date))].sort();
  return dayGroups(within, keys);
}

/** Há mais compromissos para lá da janela atual da lista? */
export function hasMoreAfter(
  events: readonly AgendaEvent[],
  todayKey: string,
  days: number,
): boolean {
  const limit = addDaysKey(todayKey, days);
  return events.some((e) => e.date >= limit);
}
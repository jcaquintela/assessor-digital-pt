// Instante real de um compromisso para enviar ao Google/Outlook — módulo puro.
//
// Bug que isto corrige: o push para o calendário usava só `due_date`, que em
// muitos registos é a meia-noite UTC do dia (ex. 2026-08-26T00:00:00Z) com a
// hora guardada em `due_time` ("21:00"). Resultado: um evento pedido para as
// 21h aparecia à 01h de Lisboa (00:00Z + verão) no dia seguinte.
//
// A hora de `due_time` é sempre hora local de Lisboa e é a fonte de verdade
// quando existe; `due_date` só é usado como instante quando não há hora.
import { eventWindow, DEFAULT_EVENT_MINUTES } from "@/lib/assessor/supreme/event-window";

export interface EventTimes {
  due_date: string;
  due_time?: string | null;
}

/** Início e fim (ISO em UTC) coerentes com a hora local de Lisboa. */
export function outboundWindow(
  ev: EventTimes,
  minutes = DEFAULT_EVENT_MINUTES,
): { startIso: string; endIso: string } {
  const w = eventWindow(ev, minutes);
  if (w.startIso && w.endIso) return { startIso: w.startIso, endIso: w.endIso };
  const base = new Date(ev.due_date);
  const ms = base.getTime();
  if (!Number.isFinite(ms)) throw new Error("due_date inválido");
  return {
    startIso: base.toISOString(),
    endIso: new Date(ms + minutes * 60_000).toISOString(),
  };
}

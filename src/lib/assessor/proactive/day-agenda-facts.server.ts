// Leitura da agenda do dia para blindar a frase "agenda livre".
// Mesma janela da consulta directa de agenda: [00:00, 24:00) do dia de Lisboa.

import { lisbonInstant, lisbonYmd } from "../lisbon-day";
import { isFollowUpEvent, isFollowUpOpen } from "@/lib/follow-ups/state";
import { belongsInDailyAgenda } from "../agenda-leisure";
import { eventWindow } from "../supreme/event-window";
import type { AgendaFactEvent } from "./day-agenda-facts";

/** Todos os compromissos abertos do dia (trabalho E lazer), sem filtros de prioridade. */
export async function loadDayAgendaFacts(
  supabase: any,
  userId: string,
  now: Date = new Date(),
): Promise<AgendaFactEvent[]> {
  const ymd = lisbonYmd(now);
  const fromIso = new Date(lisbonInstant(ymd, 0, 0)).toISOString();
  const toIso = new Date(lisbonInstant(ymd, 0, 0) + 24 * 3600_000).toISOString();

  const { data } = await supabase
    .from("follow_ups")
    .select("id, title, type, due_date, due_time, duration_minutes, status, outcome, archived_at, person_id, related_property_id, opportunity_id, related_prospecting_lead_id, event_class")
    .eq("user_id", userId)
    .is("archived_at", null)
    .gte("due_date", fromIso)
    .lt("due_date", toIso)
    .order("due_date", { ascending: true })
    .limit(100);

  const rows = ((data as any[]) ?? []).filter((r) => isFollowUpOpen(r) && isFollowUpEvent(r));
  return rows.map((r) => {
    const w = eventWindow(r);
    return {
      id: String(r.id),
      title: String(r.title ?? "").trim(),
      startIso: w.startIso,
      endIso: w.endIso,
      isWork: belongsInDailyAgenda(r),
    } satisfies AgendaFactEvent;
  });
}

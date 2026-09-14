// Reavaliação do aviso de pré-evento no instante do envio.
//
// O texto ("daqui a 75 min") é escrito quando o aviso nasce, mas pode ficar em
// fila durante o horário de silêncio. Aqui recalculamos: se o compromisso já
// começou, o aviso morre em silêncio; caso contrário o tempo dito é o tempo
// real que falta agora.

import { formatPreEventNudge, minutesUntilEvent } from "./pre-event";
import type { BriefingEvent } from "../proactive/meeting-briefing";

/** Aviso só sai enquanto o compromisso ainda não começou e está dentro do dia. */
export const PRE_EVENT_MAX_LEAD_MINUTES = 6 * 60;

export function resolvePreEventText(
  ev: BriefingEvent,
  personName: string | null,
  nowMs: number,
): { send: false } | { send: true; text: string } {
  const mins = minutesUntilEvent(ev, nowMs);
  if (!Number.isFinite(mins)) return { send: false };
  if (mins <= 0 || mins > PRE_EVENT_MAX_LEAD_MINUTES) return { send: false };
  return { send: true, text: formatPreEventNudge(ev, personName, nowMs) };
}

export async function resolvePreEventAtDispatch(
  supabase: any,
  followUpId: string,
  now: Date = new Date(),
): Promise<{ send: false } | { send: true; text: string }> {
  const { data } = await supabase
    .from("follow_ups")
    .select(
      "id, title, type, due_date, due_time, status, outcome, archived_at, person_id, " +
      "related_property_id, opportunity_id, related_prospecting_lead_id, event_class, created_at, briefing_sent_at",
    )
    .eq("id", followUpId)
    .maybeSingle();
  if (!data) return { send: false };
  let personName: string | null = null;
  if ((data as any).person_id) {
    const { data: person } = await supabase
      .from("people")
      .select("name")
      .eq("id", (data as any).person_id)
      .maybeSingle();
    personName = (person as any)?.name ?? null;
  }
  return resolvePreEventText(data as BriefingEvent, personName, now.getTime());
}

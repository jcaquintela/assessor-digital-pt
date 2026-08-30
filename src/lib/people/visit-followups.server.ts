// Recolha das visitas concluídas — parte com BD, sem regras próprias.
//
// Duas origens, o mesmo formato: interações marcadas como visita (áudio
// pós-visita) e eventos de agenda do tipo visita já fechados.

import { isFollowUpClosed } from "@/lib/follow-ups/state";
import type { FollowUpSourceRow, VisitSourceRow } from "./visit-followups";

const VISIT_TYPES = new Set(["visita", "visit", "viewing", "revisita"]);

function norm(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export async function loadVisitSources(
  supabase: any,
  userId: string,
  sinceIso: string,
): Promise<{
  visits: VisitSourceRow[];
  followUps: FollowUpSourceRow[];
  people: Array<{ id: string; name: string | null }>;
  properties: Array<{ id: string; title: string | null; address: string | null }>;
}> {
  const [inter, fus, ppl, props] = await Promise.all([
    supabase
      .from("interactions")
      .select("id, occurred_at, summary, person_id, property_id, interaction_type, is_confidential")
      .eq("user_id", userId)
      .is("archived_at", null)
      .gte("occurred_at", sinceIso)
      .limit(200),
    supabase
      .from("follow_ups")
      .select("id, title, type, status, outcome, archived_at, due_date, due_time, person_id, property_id")
      .eq("user_id", userId)
      .limit(500),
    supabase.from("people").select("id, name").eq("user_id", userId).limit(1000),
    supabase.from("properties").select("id, title, address").eq("user_id", userId).limit(1000),
  ]);

  const followUps = ((fus?.data as any[]) ?? []) as FollowUpSourceRow[];

  const visits: VisitSourceRow[] = ((inter?.data as any[]) ?? [])
    .filter((i) => VISIT_TYPES.has(norm(i.interaction_type)))
    .map((i) => ({
      id: String(i.id),
      occurred_at: i.occurred_at ?? null,
      summary: i.summary ?? null,
      person_id: i.person_id ?? null,
      property_id: i.property_id ?? null,
    }));

  // Visitas que estavam na agenda e já foram dadas como fechadas.
  for (const f of followUps) {
    if (!VISIT_TYPES.has(norm(f.type))) continue;
    if (!isFollowUpClosed(f)) continue;
    const d = String(f.due_date ?? "").trim();
    if (!d || d < sinceIso.slice(0, 10)) continue;
    visits.push({
      id: `fu:${f.id}`,
      occurred_at: `${d}T${String(f.due_time ?? "12:00").slice(0, 5)}:00`,
      summary: f.title ?? null,
      person_id: f.person_id ?? null,
      property_id: f.property_id ?? null,
    });
  }

  return {
    visits,
    followUps,
    people: ((ppl?.data as any[]) ?? []) as any,
    properties: ((props?.data as any[]) ?? []) as any,
  };
}

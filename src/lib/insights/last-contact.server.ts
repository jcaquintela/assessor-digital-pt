// Leitura das linhas que definem "contacto real" (ver `last-contact.ts`).
// Mentor e Deteção de Oportunidades chamam esta função — nunca constroem
// mapas próprios, para não poderem discordar sobre o que está "parado".

import {
  buildLastContactMaps,
  type LastContactInput,
  type LastContactMaps,
} from "./last-contact";

export type { LastContactMaps };

export async function fetchLastContactRows(supabase: any, userId: string): Promise<LastContactInput> {
  const [ints, done, links] = await Promise.all([
    supabase
      .from("interactions")
      .select("person_id, opportunity_id, property_id, occurred_at, interaction_type, source_channel")
      .eq("user_id", userId)
      .limit(2000),
    supabase
      .from("follow_ups")
      .select("person_id, opportunity_id, related_property_id, outcome_recorded_at")
      .eq("user_id", userId)
      .not("outcome_recorded_at", "is", null),
    supabase.from("opportunity_properties").select("opportunity_id, property_id").eq("user_id", userId),
  ]);

  return {
    interactions: ((ints.data as any[]) ?? []),
    followUps: ((done.data as any[]) ?? []),
    links: ((links.data as any[]) ?? []),
  };
}

export async function computeLastContact(
  supabase: any,
  userId: string,
): Promise<{ maps: LastContactMaps; rows: LastContactInput }> {
  const rows = await fetchLastContactRows(supabase, userId);
  return { maps: buildLastContactMaps(rows), rows };
}

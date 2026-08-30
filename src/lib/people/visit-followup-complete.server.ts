// Concluir o seguimento de uma visita a partir do cartão "Hoje", com nota curta.
//
// Reutiliza a MESMA regra de conclusão do motor (COMPLETED_STATUS /
// COMPLETED_OUTCOME + stopFollowUpTriggers) para não existirem duas noções
// de "concluído". A nota curta é registada como interação, tal como qualquer
// outro registo escrito pelo consultor.

import { COMPLETED_STATUS, COMPLETED_OUTCOME } from "@/lib/assessor/v3/completion-intent";
import { stopFollowUpTriggers } from "@/lib/calendar/stop-triggers.server";

export interface CompleteVisitFollowUpInput {
  followUpId: string | null;
  note: string | null;
  personId: string | null;
  propertyId: string | null;
}

export async function completeVisitFollowUpOnServer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  input: CompleteVisitFollowUpInput,
): Promise<{ completed: boolean; noted: boolean }> {
  const nota = String(input.note ?? "").trim().slice(0, 600);
  let completed = false;

  if (input.followUpId) {
    const { data, error } = await supabase
      .from("follow_ups")
      .update({
        status: COMPLETED_STATUS,
        outcome: COMPLETED_OUTCOME,
        outcome_recorded_at: new Date().toISOString(),
        ...(nota ? { outcome_notes: nota } : {}),
      })
      .eq("user_id", userId)
      .eq("id", input.followUpId)
      .select("id");
    if (error) throw new Error(error.message);
    const ids = (Array.isArray(data) ? data : []).map((r: { id: string }) => r.id);
    completed = ids.length > 0;
    if (ids.length) await stopFollowUpTriggers(supabase, userId, ids);
  }

  let noted = false;
  if (nota) {
    const { error } = await supabase.from("interactions").insert({
      user_id: userId,
      person_id: input.personId,
      property_id: input.propertyId,
      source_channel: "web",
      original_content: nota,
      summary: null,
      interaction_type: "nota",
      occurred_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    noted = true;
  }

  return { completed, noted };
}

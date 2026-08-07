// Quando um compromisso é desmarcado ou arquivado no Afonso, tem de parar de
// disparar em TODO o lado: avisos internos (`reminders`) e evento no
// calendário externo. Caso real (07/08): a "Visita com Sr. Almeida" foi
// arquivada, mas o evento continuou no Google Calendar e voltou a entrar no
// briefing e a lembrar às 11h.
import { pushEventToProviders } from "./sync.server";

// Arquivar a partir do dashboard ("Hoje" → ficha do evento → Arquivar) tem de
// ter exactamente o mesmo efeito que desmarcar por conversa: fecha o
// seguimento, cala os avisos internos e apaga o evento no calendário ligado.
export async function archiveFollowUpEverywhere(
  supabase: any,
  userId: string,
  followUpId: string,
): Promise<void> {
  await stopFollowUpTriggers(supabase, userId, [followUpId]);
  await supabase
    .from("follow_ups")
    .update({ archived_at: new Date().toISOString(), status: "cancelado" } as never)
    .eq("id", followUpId)
    .eq("user_id", userId);
}

export async function stopFollowUpTriggers(
  supabase: any,
  userId: string,
  followUpIds: string[],
): Promise<void> {
  const ids = [...new Set(followUpIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    await supabase
      .from("reminders")
      .update({ status: "cancelled" } as never)
      .eq("user_id", userId)
      .eq("related_resource_type", "follow_up")
      .in("related_resource_id", ids)
      .in("status", ["scheduled", "processing", "failed"]);
  } catch (e) {
    console.error("[stop-triggers] cancelar avisos falhou", e);
  }
  for (const id of ids) {
    // Nunca lança: falhar o calendário não pode impedir o arquivo.
    await pushEventToProviders({ userId, followUpId: id, action: "delete" });
  }
}

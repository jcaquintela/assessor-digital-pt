// Quando um compromisso é desmarcado ou arquivado no Afonso, tem de parar de
// disparar em TODO o lado: avisos internos (`reminders`) e evento no
// calendário externo. Caso real (07/08): a "Visita com Sr. Almeida" foi
// arquivada, mas o evento continuou no Google Calendar e voltou a entrar no
// briefing e a lembrar às 11h.
import { pushEventToProviders } from "./sync.server";

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

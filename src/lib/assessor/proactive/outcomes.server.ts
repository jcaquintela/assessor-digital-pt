// Registo do resultado de um seguimento a partir de um botão do canal.
// Mesma semântica do bloco "Aguardam resultado" em /hoje.

import { OUTCOME_LABEL, type FollowUpOutcome } from "@/lib/assessor/interactive";

export async function applyFollowUpOutcome(
  supabase: any,
  userId: string,
  followUpId: string,
  outcome: FollowUpOutcome,
): Promise<{ ok: boolean; title: string | null }> {
  const { data: row } = await supabase
    .from("follow_ups")
    .select("id, title")
    .eq("id", followUpId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return { ok: false, title: null };

  const patch: Record<string, unknown> = {
    outcome,
    outcome_recorded_at: new Date().toISOString(),
  };
  if (outcome === "concluido") patch.status = "Concluído";

  const { error } = await supabase
    .from("follow_ups")
    .update(patch as never)
    .eq("id", followUpId)
    .eq("user_id", userId);
  if (error) return { ok: false, title: row.title ?? null };
  return { ok: true, title: row.title ?? null };
}

export function outcomeAck(outcome: FollowUpOutcome, title: string | null): string {
  const what = title ? `"${title}"` : "o seguimento";
  if (outcome === "concluido") return `Boa. Dei ${what} como concluído.`;
  if (outcome === "precisa_nova_acao") return `Fica marcado: ${what} precisa de seguimento. Queres que agende?`;
  return `Registei ${what} como sem efeito.`;
}

export { OUTCOME_LABEL };
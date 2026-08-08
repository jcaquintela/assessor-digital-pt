// Registo do resultado de um seguimento a partir de um botão do canal.
// Mesma semântica do bloco "Aguardam resultado" em /hoje.

import { OUTCOME_LABEL, type FollowUpOutcome } from "@/lib/assessor/interactive";
import { isTerminalOutcome, statusForOutcome } from "@/lib/assessor/outcome-status";
import {
  decideOutcomeTarget,
  type OutcomeCandidate,
  type OutcomeTargetDecision,
} from "@/lib/assessor/outcome-target";

export async function applyFollowUpOutcome(
  supabase: any,
  userId: string,
  followUpId: string,
  outcome: FollowUpOutcome | string,
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
  const status = statusForOutcome(String(outcome));
  if (status) patch.status = status;

  const { error } = await supabase
    .from("follow_ups")
    .update(patch as never)
    .eq("id", followUpId)
    .eq("user_id", userId);
  if (error) return { ok: false, title: row.title ?? null };

  // Um seguimento fechado não pode continuar a disparar avisos.
  if (isTerminalOutcome(String(outcome))) {
    try {
      await supabase
        .from("reminders")
        .update({ status: "cancelled" } as never)
        .eq("user_id", userId)
        .eq("related_resource_type", "follow_up")
        .eq("related_resource_id", followUpId)
        .in("status", ["scheduled", "processing", "failed"]);
    } catch { /* best-effort */ }
  }
  return { ok: true, title: row.title ?? null };
}

/**
 * Descobre a que seguimento se refere uma resposta escrita ("já liguei",
 * "fica sem efeito"): o último seguimento sobre o qual o Assessor falou
 * (lembrete, check-in) e que ainda está aberto.
 */
export async function resolveOutcomeTargetFollowUp(
  supabase: any,
  userId: string,
  opts: { withinHours?: number; now?: Date } = {},
): Promise<{ id: string; title: string } | null> {
  const since = new Date(
    (opts.now ?? new Date()).getTime() - (opts.withinHours ?? 36) * 3600_000,
  ).toISOString();
  const { data: msgs } = await supabase
    .from("assessor_messages")
    .select("related_resource_id, created_at")
    .eq("user_id", userId)
    .eq("role", "assistant")
    .eq("related_resource_type", "follow_up")
    .in("message_type", ["followup_reminder", "outcome_checkin"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);
  const ids = [...new Set(((msgs as any[]) ?? []).map((m) => m.related_resource_id).filter(Boolean))];
  if (!ids.length) return null;
  for (const id of ids) {
    const { data: fu } = await supabase
      .from("follow_ups")
      .select("id, title, outcome")
      .eq("id", id)
      .eq("user_id", userId)
      .is("outcome", null)
      .maybeSingle();
    if (fu) return { id: (fu as any).id, title: String((fu as any).title ?? "") };
  }
  return null;
}

export function outcomeAck(outcome: FollowUpOutcome | string, title: string | null): string {
  const what = title ? `"${title}"` : "o seguimento";
  if (outcome === "concluido") return `Boa. Dei ${what} como concluído.`;
  if (outcome === "precisa_nova_acao") return `Fica marcado: ${what} precisa de seguimento. Queres que agende?`;
  return `Registei ${what} como sem efeito. Não volto a lembrar-te disso.`;
}

/** Seguimentos abertos recentes, com a pessoa ligada, para comparar com o nome dito. */
async function listOpenCandidates(supabase: any, userId: string): Promise<OutcomeCandidate[]> {
  const { data } = await supabase
    .from("follow_ups")
    .select("id, title, person_id, people:person_id(name)")
    .eq("user_id", userId)
    .is("outcome", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  return (((data as any[]) ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    personName: (r.people?.name ?? null) as string | null,
  })));
}

/**
 * Bug real (08/08): "O Sr. Coelho desistiu de tudo" fechou "Reunião de equipa",
 * um check-in pendente de outro dia. Um nome próprio explícito manda sempre
 * sobre o pendente; havendo dúvida, pergunta-se.
 */
export async function resolveOutcomeTargetFromText(
  supabase: any,
  userId: string,
  text: string,
): Promise<OutcomeTargetDecision> {
  const pending = await resolveOutcomeTargetFollowUp(supabase, userId);
  const candidates = await listOpenCandidates(supabase, userId);
  return decideOutcomeTarget({ text, pending, candidates });
}

function legacyOutcomeAck(outcome: FollowUpOutcome | string, title: string | null): string {
  const what = title ? `"${title}"` : "o seguimento";
  if (outcome === "concluido") return `Boa. Dei ${what} como concluído.`;
  if (outcome === "precisa_nova_acao") return `Fica marcado: ${what} precisa de seguimento. Queres que agende?`;
  return `Registei ${what} como sem efeito. Não volto a lembrar-te disso.`;
}

export { OUTCOME_LABEL };

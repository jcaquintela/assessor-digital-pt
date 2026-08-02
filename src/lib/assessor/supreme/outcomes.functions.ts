import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTerminalOutcome, statusForOutcome } from "@/lib/assessor/outcome-status";

const VALID_OUTCOMES = new Set([
  "concluido", "nao_realizado", "adiado", "sem_resposta", "precisa_nova_acao", "cancelado",
]);

export const saveFollowUpOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as { id?: string; outcome?: string; notes?: string };
    return {
      id: String(o.id ?? ""),
      outcome: String(o.outcome ?? ""),
      notes: o.notes ? String(o.notes).slice(0, 500) : null,
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    if (!VALID_OUTCOMES.has(data.outcome)) throw new Error("invalid outcome");
    const patch: Record<string, unknown> = {
      outcome: data.outcome,
      outcome_notes: data.notes,
      outcome_recorded_at: new Date().toISOString(),
    };
    const status = statusForOutcome(data.outcome);
    if (status) patch.status = status;
    const { error } = await context.supabase
      .from("follow_ups")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (isTerminalOutcome(data.outcome)) {
      await context.supabase
        .from("reminders")
        .update({ status: "cancelled" } as never)
        .eq("user_id", context.userId)
        .eq("related_resource_type", "follow_up")
        .eq("related_resource_id", data.id)
        .in("status", ["scheduled", "processing", "failed"]);
    }
    return { ok: true };
  });

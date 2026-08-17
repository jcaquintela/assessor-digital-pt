import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OpportunityAlert } from "./detector";

/** Resumo diário agregado de oportunidades detetadas para o consultor. */
export const listOpportunityAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ alerts: OpportunityAlert[] }> => {
    const { computeOpportunityAlerts } = await import("./detector.server");
    const alerts = await computeOpportunityAlerts(context.supabase, context.userId);
    return { alerts: alerts.slice(0, 12) };
  });

/** Silencia um alerta específico durante os dias escolhidos pelo consultor. */
export const muteOpportunityAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { alertKey: string; days: number }) => {
    const alertKey = String(data?.alertKey ?? "").trim();
    const days = Math.floor(Number(data?.days));
    if (!alertKey) throw new Error("Falta o alerta a silenciar.");
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new Error("Escolhe um número de dias entre 1 e 365.");
    }
    return { alertKey, days };
  })
  .handler(async ({ context, data }) => {
    const mutedUntil = new Date(Date.now() + data.days * 864e5).toISOString();
    const { error } = await context.supabase
      .from("alert_mutes")
      .upsert(
        { user_id: context.userId, alert_key: data.alertKey, muted_until: mutedUntil },
        { onConflict: "user_id,alert_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const, mutedUntil };
  });
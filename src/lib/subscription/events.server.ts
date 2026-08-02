// MÉTRICAS DE SUBSCRIÇÃO — eventos separados para o funil de aquisição.
//
// Cada transição de plano fica registada uma vez, com origem, para que o
// admin consiga distinguir Trial→Consultor de Trial→Pro ou Trial→Base.

export type SubscriptionEvent =
  | "trial_started"
  | "trial_to_consultor"
  | "trial_to_pro"
  | "trial_to_base"
  | "base_to_paid"
  | "paid_to_base"
  | "churn"
  | "reactivation";

export function trialOutcomeEvent(toTier: string): SubscriptionEvent {
  if (toTier === "pro") return "trial_to_pro";
  if (toTier === "consultor" || toTier === "hub") return "trial_to_consultor";
  return "trial_to_base";
}

export async function recordSubscriptionEvent(
  supabaseAdmin: any,
  input: {
    userId: string;
    event: SubscriptionEvent;
    fromTier?: string | null;
    toTier?: string | null;
    source?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabaseAdmin.from("subscription_events").insert({
      user_id: input.userId,
      event: input.event,
      from_tier: input.fromTier ?? null,
      to_tier: input.toTier ?? null,
      source: input.source ?? null,
      metadata: input.metadata ?? {},
    } as never);
  } catch (err) {
    // Métrica nunca pode partir o fluxo de negócio.
    console.error("[subscription-events] falhou:", err instanceof Error ? err.message : err);
  }
}
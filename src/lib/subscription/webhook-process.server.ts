import { decideSync, profileLookupFromEvent, type ProfileBilling } from "./billing-sync";
import { claimVerdict, isUniqueViolation, WebhookInFlightError, type WebhookEventRow } from "./webhook-claim";

// Aplica um evento de pagamento já verificado, com reserva idempotente e
// reprocessamento seguro após falha (ver webhook-claim.ts).

export type StripeEventLike = { id: string; type: string; data: { object: any } };
export type ProcessResult = "applied" | "skipped" | "duplicate";

async function findProfile(
  sa: any,
  lookup: { userId?: string; customerId?: string; subscriptionId?: string },
): Promise<ProfileBilling | null> {
  const cols = "id, billing_source, billing_manual_lock";
  if (lookup.userId) {
    const { data } = await sa.from("profiles").select(cols).eq("id", lookup.userId).maybeSingle();
    if (data) return data as ProfileBilling;
  }
  if (lookup.subscriptionId) {
    const { data } = await sa.from("profiles").select(cols).eq("stripe_subscription_id", lookup.subscriptionId).maybeSingle();
    if (data) return data as ProfileBilling;
  }
  if (lookup.customerId) {
    const { data } = await sa.from("profiles").select(cols).eq("stripe_customer_id", lookup.customerId).maybeSingle();
    if (data) return data as ProfileBilling;
  }
  return null;
}

/** Reserva o evento. Devolve o id da linha a tratar, ou null se já aplicado. */
async function claimEvent(sa: any, event: StripeEventLike, env: string, nowMs: number): Promise<string | null> {
  const ins = await sa
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type, environment: env, outcome: "pending" } as never)
    .select("id")
    .maybeSingle();
  if (!ins.error) return (ins.data as any)?.id ?? null;
  // Qualquer erro que não seja "já existe" é uma falha real: o Stripe reenvia.
  if (!isUniqueViolation(ins.error)) throw new Error(`claim failed: ${ins.error.message}`);

  const { data: row, error } = await sa
    .from("stripe_webhook_events")
    .select("id, outcome, processed_at")
    .eq("event_id", event.id)
    .maybeSingle();
  if (error || !row) throw new Error(`claim lookup failed: ${error?.message ?? "missing row"}`);
  const verdict = claimVerdict(row as WebhookEventRow, nowMs);
  if (verdict === "done") return null;
  if (verdict === "in_flight") throw new WebhookInFlightError(event.id);

  // Reabrir só se ninguém mexeu entretanto (concorrência otimista).
  let q = sa
    .from("stripe_webhook_events")
    .update({ outcome: "pending", detail: "retry", processed_at: new Date(nowMs).toISOString() } as never)
    .eq("id", (row as any).id)
    .eq("outcome", (row as any).outcome);
  q = (row as any).processed_at ? q.eq("processed_at", (row as any).processed_at) : q.is("processed_at", null);
  const { data: reopened, error: upErr } = await q.select("id");
  if (upErr) throw new Error(`claim reopen failed: ${upErr.message}`);
  if (!reopened || reopened.length === 0) throw new WebhookInFlightError(event.id);
  return (row as any).id;
}

export async function processStripeEvent(
  sa: any,
  event: StripeEventLike,
  env: string,
  nowMs: number = Date.now(),
): Promise<ProcessResult> {
  const rowId = await claimEvent(sa, event, env, nowMs);
  if (!rowId) return "duplicate";

  const finish = (patch: Record<string, unknown>) =>
    sa.from("stripe_webhook_events")
      .update({ ...patch, processed_at: new Date().toISOString() } as never)
      .eq("id", rowId);

  let profileId: string | null = null;
  try {
    const lookup = profileLookupFromEvent({ type: event.type, object: event.data.object });
    const profile = await findProfile(sa, lookup);
    profileId = profile?.id ?? null;
    const decision = decideSync({ type: event.type, object: event.data.object }, profile);
    if (decision.action === "skip") {
      await finish({ outcome: "skipped", detail: decision.reason, profile_id: profileId });
      return "skipped";
    }
    const { error } = await sa
      .from("profiles")
      .update({ ...decision.patch, updated_at: new Date().toISOString() } as never)
      .eq("id", profile!.id);
    if (error) throw new Error(error.message);
    await finish({ outcome: "processed", detail: decision.note, profile_id: profileId });
    return "applied";
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    try { await finish({ outcome: "failed", detail: msg.slice(0, 500), profile_id: profileId }); } catch { /* best-effort */ }
    throw e;
  }
}

import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";
import {
  computeMrr,
  isActiveBilling,
  type PaymentsEnvironment,
  type PaymentsStatus,
} from "./payments-status";

export function detectPaymentsEnvironment(): PaymentsEnvironment {
  if (process.env["STRIPE_LIVE_API_KEY"]) return "live";
  if (process.env["STRIPE_SANDBOX_API_KEY"]) return "sandbox";
  return "none";
}

/** Testa mesmo a chave: existir não chega. */
export async function probeStripe(
  env: StripeEnv,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const stripe = createStripeClient(env);
    await stripe.products.list({ limit: 1 });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: getStripeErrorMessage(error) };
  }
}

/** Estado único consumido por Faturação, MRR, Negócio e Subscrições. */
export async function readPaymentsStatus(supabaseAdmin: any): Promise<PaymentsStatus> {
  const environment = detectPaymentsEnvironment();

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("billing_source, billing_status, stripe_price_id, stripe_subscription_id, stripe_customer_id")
    .limit(1000);

  const all = ((data ?? []) as any[]).map((r) => ({
    priceId: (r.stripe_price_id ?? null) as string | null,
    status: (r.billing_status ?? "none") as string,
    source: ((r.billing_source ?? "manual") === "stripe" ? "stripe" : "manual") as
      | "stripe"
      | "manual",
    hasStripe: Boolean(r.stripe_subscription_id || r.stripe_customer_id),
  }));

  const subs = all.filter((r) => r.source === "stripe" || r.hasStripe);

  if (environment === "none") {
    return {
      connected: false,
      environment,
      error: null,
      subscriptionsCount: subs.length,
      activeCount: subs.filter((r) => isActiveBilling(r.status)).length,
      mrr: 0,
    };
  }

  const probe = await probeStripe(environment);
  return {
    connected: probe.ok,
    environment: probe.ok ? environment : "none",
    error: probe.error,
    subscriptionsCount: subs.length,
    activeCount: subs.filter((r) => isActiveBilling(r.status)).length,
    mrr: computeMrr(subs),
  };
}
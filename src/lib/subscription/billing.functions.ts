import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";
import { isAllowedReturnUrl, isCheckoutPriceAllowed, stripePriceProblem } from "./checkout-policy";

type CheckoutSessionResult = { clientSecret: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.["userId"] !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

// Abre o checkout da subscrição para o consultor autenticado.
export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
    if (data.environment !== "sandbox" && data.environment !== "live") throw new Error("Invalid environment");
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    // Lista fechada no servidor: só os planos que vendemos e só regressos à app.
    if (!isCheckoutPriceAllowed(data.priceId)) return { error: "Este plano não está disponível." };
    if (!isAllowedReturnUrl(data.returnUrl)) return { error: "Endereço de regresso não permitido." };
    try {
      const { supabase, userId } = context;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      const stripePrice = prices.data[0];
      const problem = stripePriceProblem(stripePrice as any, data.priceId);
      if (problem) return { error: problem };

      const customerId = await resolveOrCreateCustomer(stripe, {
        email: user?.email ?? undefined,
        userId,
      });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        client_reference_id: userId,
        managed_payments: { enabled: true },
        metadata: { userId },
        subscription_data: { metadata: { userId } },
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Portal do cliente (cancelar, mudar cartão, ver faturas).
export const createBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => {
    if (data.environment !== "sandbox" && data.environment !== "live") throw new Error("Invalid environment");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    if (data.returnUrl && !isAllowedReturnUrl(data.returnUrl)) return { error: "Endereço de regresso não permitido." };
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    const customerId = (profile as any)?.stripe_customer_id as string | null | undefined;
    if (!customerId) return { error: "Ainda não há subscrição associada a esta conta." };
    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export type MyBilling = {
  tier: string;
  billingStatus: string;
  billingSource: string;
  priceId: string | null;
  hasCustomer: boolean;
};

export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyBilling> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("subscription_tier, billing_status, billing_source, stripe_price_id, stripe_customer_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const p = (data ?? {}) as any;
    return {
      tier: p.subscription_tier ?? "base",
      billingStatus: p.billing_status ?? "none",
      billingSource: p.billing_source ?? "manual",
      priceId: p.stripe_price_id ?? null,
      hasCustomer: Boolean(p.stripe_customer_id),
    };
  });
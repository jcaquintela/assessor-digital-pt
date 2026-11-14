import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";
import {
  CHECKOUT_FLAG, checkoutGateProblem, isAllowedReturnUrl, isCheckoutPriceAllowed, onRequestTiers,
  sellablePriceIds, stripePriceProblem, type PlanConfigRow,
} from "./checkout-policy";
import { checkoutEnvProblem } from "./billing-guard";

// Contexto do servidor para decidir o que esta conta pode abrir (nunca o navegador).
async function checkoutContext(userId: string) {
  const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
  const { isAccountFlagEnabled } = await import("@/lib/flags/account-flag.server");
  const [t, plans, flagOn] = await Promise.all([
    sa.from("billing_test_accounts").select("user_id").eq("user_id", userId).maybeSingle(),
    sa.from("plan_configs").select("tier, status, pricing_mode"),
    isAccountFlagEnabled(sa, CHECKOUT_FLAG, userId),
  ]);
  return {
    isTestAccount: Boolean(t.data),
    liveConfigured: Boolean(process.env.STRIPE_LIVE_API_KEY),
    flagOn,
    configs: (plans.data ?? []) as PlanConfigRow[],
  };
}

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
    const ctx = await checkoutContext(context.userId);
    const envProblem = checkoutEnvProblem(data.environment, ctx);
    if (envProblem) return { error: envProblem };
    const gate = checkoutGateProblem({ flagOn: ctx.flagOn, env: data.environment, isTestAccount: ctx.isTestAccount });
    if (gate) return { error: gate };
    if (!sellablePriceIds(ctx.configs).includes(data.priceId)) {
      return { error: "Este plano não tem subscrição direta. Pede uma proposta." };
    }
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
      .select("stripe_customer_id, billing_environment")
      .eq("id", userId)
      .maybeSingle();
    const customerId = (profile as any)?.stripe_customer_id as string | null | undefined;
    if (!customerId) return { error: "Ainda não há subscrição associada a esta conta." };
    // O portal abre no ambiente onde a subscrição existe, nunca noutro.
    const profileEnv = (profile as any)?.billing_environment ?? "sandbox";
    if (data.environment !== profileEnv) return { error: "Esta subscrição não está neste ambiente de pagamentos." };
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
export type CheckoutAvailability = { enabled: boolean; sellablePriceIds: string[]; onRequestTiers: string[] };

// O que a página de subscrição pode mostrar a esta conta.
export const getCheckoutAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckoutAvailability> => {
    const ctx = await checkoutContext(context.userId);
    const enabled = ctx.flagOn || ctx.isTestAccount;
    return {
      enabled,
      sellablePriceIds: enabled ? sellablePriceIds(ctx.configs) : [],
      onRequestTiers: onRequestTiers(ctx.configs),
    };
  });

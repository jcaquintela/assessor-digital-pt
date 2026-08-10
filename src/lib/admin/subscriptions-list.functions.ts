import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminSubscriptionRow = {
  userId: string;
  name: string | null;
  email: string | null;
  source: "manual" | "stripe";
  status: string;
  tier: string;
  priceId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  environment: string;
  updatedAt: string | null;
};

export type AdminSubscriptionsReport = {
  /** A integração de pagamentos está mesmo ligada neste projeto? */
  connected: boolean;
  environment: "sandbox" | "live" | "none";
  rows: AdminSubscriptionRow[];
  counts: { total: number; active: number; stripe: number; manual: number };
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const getAdminSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSubscriptionsReport> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fonte única partilhada com Faturação, MRR e Negócio.
    const { readPaymentsStatus } = await import("./payments-status.server");
    const paymentsStatus = await readPaymentsStatus(supabaseAdmin);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, name, email, billing_source, billing_status, subscription_tier, stripe_price_id, stripe_subscription_id, stripe_customer_id, billing_environment, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const all = ((data ?? []) as any[]).map(
      (r): AdminSubscriptionRow => ({
        userId: r.id,
        name: r.name,
        email: r.email,
        source: (r.billing_source ?? "manual") as "manual" | "stripe",
        status: r.billing_status ?? "none",
        tier: r.subscription_tier ?? "base",
        priceId: r.stripe_price_id ?? null,
        subscriptionId: r.stripe_subscription_id ?? null,
        customerId: r.stripe_customer_id ?? null,
        environment: r.billing_environment ?? "sandbox",
        updatedAt: r.updated_at ?? null,
      }),
    );

    // Mostramos quem tem subscrição sincronizada ou um plano pago gerido à mão.
    const rows = all.filter(
      (r) => r.subscriptionId || r.customerId || r.source === "stripe" || (r.status && r.status !== "none"),
    );

    return {
      connected: paymentsStatus.connected,
      environment: paymentsStatus.environment,
      rows,
      counts: {
        total: rows.length,
        active: rows.filter((r) => r.status === "active" || r.status === "trialing").length,
        stripe: rows.filter((r) => r.source === "stripe").length,
        manual: rows.filter((r) => r.source === "manual").length,
      },
    };
  });

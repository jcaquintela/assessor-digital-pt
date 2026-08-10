import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditAccess } from "./acessos.functions";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles: string[] = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export type ConsultantBilling = {
  billingSource: "manual" | "stripe";
  manualLock: boolean;
  billingStatus: string;
  priceId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  environment: string;
  events: { id: string; type: string; outcome: string; detail: string | null; at: string }[];
};

export const getConsultantBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ConsultantBilling> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: p, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "billing_source, billing_manual_lock, billing_status, stripe_price_id, stripe_customer_id, stripe_subscription_id, billing_environment",
      )
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (p ?? {}) as any;

    const { data: ev } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("id, event_type, outcome, detail, processed_at")
      .eq("profile_id", data.userId)
      .order("processed_at", { ascending: false })
      .limit(15);

    return {
      billingSource: (row.billing_source ?? "manual") as "manual" | "stripe",
      manualLock: Boolean(row.billing_manual_lock),
      billingStatus: row.billing_status ?? "none",
      priceId: row.stripe_price_id ?? null,
      customerId: row.stripe_customer_id ?? null,
      subscriptionId: row.stripe_subscription_id ?? null,
      environment: row.billing_environment ?? "sandbox",
      events: ((ev ?? []) as any[]).map((e) => ({
        id: e.id,
        type: e.event_type,
        outcome: e.outcome,
        detail: e.detail,
        at: e.processed_at,
      })),
    };
  });

// Passar para gestão manual (webhook passa a ignorar) ou reativar sincronização.
export const setBillingSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), source: z.enum(["manual", "stripe"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        billing_source: data.source,
        billing_manual_lock: data.source === "manual",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await auditAccess(context.userId, `billing.source.${data.source}`, {
      target_user_id: data.userId,
      resource_type: "profile",
      resource_id: data.userId,
      reason:
        data.source === "manual"
          ? "Conta passada para gestão manual — sincronização automática ignora esta conta."
          : "Sincronização automática de subscrição reativada.",
      after: { billing_source: data.source },
    });

    return { ok: true as const };
  });
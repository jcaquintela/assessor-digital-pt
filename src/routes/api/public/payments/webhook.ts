import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { decideSync, profileLookupFromEvent, type ProfileBilling } from "@/lib/subscription/billing-sync";

async function findProfile(
  supabaseAdmin: any,
  lookup: { userId?: string; customerId?: string; subscriptionId?: string },
): Promise<ProfileBilling | null> {
  const cols = "id, billing_source, billing_manual_lock";
  if (lookup.userId) {
    const { data } = await supabaseAdmin.from("profiles").select(cols).eq("id", lookup.userId).maybeSingle();
    if (data) return data as ProfileBilling;
  }
  if (lookup.subscriptionId) {
    const { data } = await supabaseAdmin
      .from("profiles").select(cols).eq("stripe_subscription_id", lookup.subscriptionId).maybeSingle();
    if (data) return data as ProfileBilling;
  }
  if (lookup.customerId) {
    const { data } = await supabaseAdmin
      .from("profiles").select(cols).eq("stripe_customer_id", lookup.customerId).maybeSingle();
    if (data) return data as ProfileBilling;
  }
  return null;
}

async function handleWebhook(request: Request, env: StripeEnv) {
  const event = await verifyWebhook(request, env);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Idempotência: o Stripe reenvia eventos. O UNIQUE em event_id garante
  // que o mesmo evento nunca é aplicado duas vezes.
  const claim = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      environment: env,
      outcome: "pending",
    } as never)
    .select("id")
    .maybeSingle();
  if (claim.error) {
    console.log("Evento repetido, ignorado:", event.id, claim.error.message);
    return;
  }
  const rowId = (claim.data as any)?.id as string | undefined;

  const lookup = profileLookupFromEvent({ type: event.type, object: event.data.object });
  const profile = await findProfile(supabaseAdmin, lookup);
  const decision = decideSync({ type: event.type, object: event.data.object }, profile);

  if (decision.action === "skip") {
    await supabaseAdmin
      .from("stripe_webhook_events")
      .update({ outcome: "skipped", detail: decision.reason, profile_id: profile?.id ?? null } as never)
      .eq("id", rowId as string);
    return;
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ ...decision.patch, updated_at: new Date().toISOString() } as never)
    .eq("id", profile!.id);

  await supabaseAdmin
    .from("stripe_webhook_events")
    .update({
      outcome: error ? "failed" : "processed",
      detail: error ? error.message : decision.note,
      profile_id: profile!.id,
    } as never)
    .eq("id", rowId as string);

  if (error) throw new Error(error.message);
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook com env inválido:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
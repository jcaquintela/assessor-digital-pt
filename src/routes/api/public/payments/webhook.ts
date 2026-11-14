import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { WebhookInFlightError } from "@/lib/subscription/webhook-claim";

// Eventos de pagamento. A assinatura do Stripe é a única autenticação.
// Idempotência e reprocessamento após falha: webhook-process.server.ts.
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook com env inválido:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        let event;
        try {
          event = await verifyWebhook(request, env);
        } catch (e) {
          console.error("Webhook signature error:", (e as Error)?.message);
          return new Response("Webhook error", { status: 400 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { processStripeEvent } = await import("@/lib/subscription/webhook-process.server");
          const { createStripeClient } = await import("@/lib/stripe.server");
          const result = await processStripeEvent(supabaseAdmin, event as any, env, Date.now(), {
            retrieveSubscription: (id) => createStripeClient(env).subscriptions.retrieve(id) as any,
          });
          return Response.json({ received: true, result });
        } catch (e) {
          if (e instanceof WebhookInFlightError) {
            return new Response("Event in progress", { status: 409 });
          }
          console.error("Webhook error:", (e as Error)?.message);
          return new Response("Webhook error", { status: 500 });
        }
      },
    },
  },
});

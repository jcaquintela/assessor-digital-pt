import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createSubscriptionCheckout } from "@/lib/subscription/billing.functions";

export function SubscriptionCheckout({ priceId, returnUrl }: { priceId: string; returnUrl?: string }) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createSubscriptionCheckout({
      data: {
        priceId,
        returnUrl: returnUrl || `${window.location.origin}/subscricao?checkout=done`,
        environment: getStripeEnvironment(),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("O checkout não devolveu sessão.");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="mt-6">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
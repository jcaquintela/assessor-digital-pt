import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentTestModeBanner } from "@/components/payment-test-banner";
import { SubscriptionCheckout } from "@/components/subscricao/checkout";
import { getMyBilling, createBillingPortal } from "@/lib/subscription/billing.functions";
import { PLAN_OFFERS, BILLING_STATUS_LABEL } from "@/lib/subscription/billing-plans";
import { tierLabel } from "@/lib/subscription/tiers";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/subscricao")({
  head: () => ({
    meta: [
      { title: "Subscrição — Afonso" },
      { name: "description", content: "Escolhe o teu plano do Afonso e gere a subscrição." },
      { property: "og:title", content: "Subscrição — Afonso" },
      { property: "og:description", content: "Escolhe o teu plano do Afonso e gere a subscrição." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscricaoPage,
});

const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

function SubscricaoPage() {
  const fetchBilling = useServerFn(getMyBilling);
  const portalFn = useServerFn(createBillingPortal);
  const { data, isPending } = useQuery({ queryKey: ["my-billing"], queryFn: () => fetchBilling() });
  const [priceId, setPriceId] = useState<string | null>(null);

  const openPortal = async () => {
    try {
      const r = await portalFn({
        data: { returnUrl: `${window.location.origin}/subscricao`, environment: getStripeEnvironment() },
      });
      if ("error" in r) throw new Error(r.error);
      window.open(r.url, "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Subscrição" />
      <PaymentTestModeBanner />

      <Card>
        <CardContent className="p-4 text-sm">
          {isPending || !data ? (
            <span className="c-muted">A carregar…</span>
          ) : (
            <>
              <div>
                Plano atual: <strong>{tierLabel(data.tier)}</strong>
              </div>
              <div className="c-muted mt-1 text-[13px]">
                {BILLING_STATUS_LABEL[data.billingStatus] ?? data.billingStatus}
                {data.billingSource === "manual" ? " · plano definido pela equipa" : ""}
              </div>
              {data.hasCustomer && (
                <button type="button" className="c-cta mt-4" onClick={openPortal}>
                  Gerir subscrição e faturas
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PLAN_OFFERS.map((o) => (
          <Card key={o.priceId}>
            <CardContent className="p-4">
              <div className="text-sm font-medium">
                {tierLabel(o.tier)} · {o.interval === "month" ? "mensal" : "anual"}
              </div>
              <div className="c-muted mt-1 text-[13px]">
                {eur(o.amountEur)} por {o.interval === "month" ? "mês" : "ano"}
              </div>
              <button
                type="button"
                className="c-cta mt-3"
                onClick={() => setPriceId(o.priceId)}
                disabled={priceId === o.priceId}
              >
                {priceId === o.priceId ? "A abrir…" : "Subscrever"}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      {priceId && <SubscriptionCheckout key={priceId} priceId={priceId} />}
    </AppShell>
  );
}
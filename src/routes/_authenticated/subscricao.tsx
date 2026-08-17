import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, ExternalLink } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentTestModeBanner } from "@/components/payment-test-banner";
import { SubscriptionCheckout } from "@/components/subscricao/checkout";
import { getMyBilling, createBillingPortal } from "@/lib/subscription/billing.functions";
import { PLAN_OFFERS, BILLING_STATUS_LABEL } from "@/lib/subscription/billing-plans";
import { tierLabel } from "@/lib/subscription/tiers";
import { getStripeEnvironment } from "@/lib/stripe";
import { appTitle } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/subscricao")({
  head: () => ({
    meta: [
      { title: appTitle("Subscrição") },
      { name: "description", content: "Escolhe o teu plano do Afonso e gere a subscrição." },
      { property: "og:title", content: appTitle("Subscrição") },
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
  const [openingPortal, setOpeningPortal] = useState(false);

  const openPortal = async () => {
    setOpeningPortal(true);
    try {
      const r = await portalFn({
        data: { returnUrl: `${window.location.origin}/subscricao`, environment: getStripeEnvironment() },
      });
      if ("error" in r) throw new Error(r.error);
      const w = window.open(r.url, "_blank", "noopener");
      if (!w) toast.error("O navegador bloqueou a janela. Permite janelas novas e tenta outra vez.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpeningPortal(false);
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
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Cartão, dados de pagamento e faturas</div>
              <p className="c-muted mt-1 text-[13px] leading-relaxed">
                Abre a área segura de pagamentos para trocar de cartão, atualizar os dados de faturação,
                descarregar faturas ou cancelar a subscrição. Não precisas de falar com ninguém — abre numa
                janela nova e voltas aqui no fim.
              </p>
              {!isPending && data && !data.hasCustomer ? (
                <p className="c-muted mt-3 text-[13px]">
                  Ainda não há pagamentos associados a esta conta. Depois de subscreveres um plano aqui em
                  baixo, este link fica disponível.
                </p>
              ) : (
                <button
                  type="button"
                  className="c-cta mt-3 inline-flex items-center gap-2"
                  onClick={openPortal}
                  disabled={isPending || openingPortal}
                >
                  {openingPortal ? "A abrir…" : "Gerir cartão e faturas"}
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
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
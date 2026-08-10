// Botão reutilizável que abre o Stripe Customer Portal num clique.
// Mostra-se só quando o consultor já tem subscrição (stripe_customer_id).
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { getMyBilling, createBillingPortal } from "@/lib/subscription/billing.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";
import { useState } from "react";

export function PaymentPortalButton({
  variant = "btn",
  label = "Gerir pagamento",
}: {
  variant?: "btn" | "ghost";
  label?: string;
}) {
  const fetchBilling = useServerFn(getMyBilling);
  const portalFn = useServerFn(createBillingPortal);
  const [opening, setOpening] = useState(false);

  const { data } = useQuery({ queryKey: ["my-billing"], queryFn: () => fetchBilling() });

  // Sem subscrição → não aparece o atalho (só faz sentido depois do 1º pagamento).
  if (!data || !data.hasCustomer) return null;

  const open = async () => {
    setOpening(true);
    try {
      const r = await portalFn({
        data: { returnUrl: `${window.location.origin}/negocio`, environment: getStripeEnvironment() },
      });
      if ("error" in r) throw new Error(r.error);
      const w = window.open(r.url, "_blank", "noopener");
      if (!w) toast.error("O navegador bloqueou a janela. Permite janelas novas e tenta outra vez.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(false);
    }
  };

  if (variant === "ghost") {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--muted)]/5"
        style={{ borderColor: "var(--border)" }}
        onClick={open}
        disabled={opening}
        aria-label={label}
      >
        <CreditCard className="h-3.5 w-3.5" />
        {opening ? "A abrir…" : label}
      </button>
    );
  }

  return (
    <button type="button" className="c-btn" onClick={open} disabled={opening}>
      <CreditCard className="h-4 w-4" /> {opening ? "A abrir…" : label}
    </button>
  );
}

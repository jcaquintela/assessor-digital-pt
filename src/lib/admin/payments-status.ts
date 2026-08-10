// Fonte única de verdade do estado dos pagamentos no admin.
// Só lógica pura aqui — a leitura real (Stripe + base de dados) vive em
// payments-status.server.ts e é exposta por payments-status.functions.ts.
import { PLAN_OFFERS } from "@/lib/subscription/billing-plans";

export type PaymentsEnvironment = "live" | "sandbox" | "none";

export type PaymentsStatus = {
  /** Ligado = existe chave E a API respondeu com sucesso. */
  connected: boolean;
  environment: PaymentsEnvironment;
  /** Motivo da falha, quando a chave existe mas a API não responde. */
  error: string | null;
  subscriptionsCount: number;
  activeCount: number;
  /** Receita mensal recorrente, em euros. */
  mrr: number;
};

export type BillingSubscriptionRow = {
  priceId: string | null;
  status: string;
  source: "manual" | "stripe";
};

export const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isActiveBilling(status: string | null | undefined): boolean {
  return ACTIVE_BILLING_STATUSES.has(status ?? "");
}

/** Preço mensal equivalente (euros) para um id de preço conhecido. */
export function monthlyAmountForPrice(priceId: string | null | undefined): number {
  if (!priceId) return 0;
  const offer = PLAN_OFFERS.find((o) => o.priceId === priceId);
  if (!offer) return 0;
  return offer.interval === "year" ? offer.amountEur / 12 : offer.amountEur;
}

/** MRR = soma dos preços ativos, com anuais divididos por 12. */
export function computeMrr(rows: BillingSubscriptionRow[]): number {
  const total = rows
    .filter((r) => r.source === "stripe" && isActiveBilling(r.status))
    .reduce((sum, r) => sum + monthlyAmountForPrice(r.priceId), 0);
  return Math.round(total * 100) / 100;
}

export function environmentLabel(env: PaymentsEnvironment): string {
  if (env === "live") return "Pagamentos ligados — produção";
  if (env === "sandbox") return "Pagamentos ligados — modo de teste";
  return "Pagamentos por ligar";
}

/** Frase única partilhada pelos quatro sítios do admin. */
export function paymentsStatusLabel(status: PaymentsStatus): string {
  if (!status.connected) {
    return status.error
      ? `Pagamentos não ligados — ${status.error}`
      : "Pagamentos não ligados";
  }
  const base = environmentLabel(status.environment);
  if (status.subscriptionsCount === 0) return `${base} — ainda sem subscrições`;
  return `${base} — ${status.activeCount} ativa(s) de ${status.subscriptionsCount}`;
}

export const eur = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

/** Texto do cartão MRR: distingue "não ligado" de "ligado sem dados". */
export function mrrCardText(status: PaymentsStatus): { value: string; sub: string; stale: boolean } {
  if (!status.connected) {
    return { value: "—", sub: "pagamentos não ligados", stale: true };
  }
  if (status.activeCount === 0) {
    return { value: eur(0), sub: "sem subscrições ativas", stale: false };
  }
  return {
    value: eur(status.mrr),
    sub: `${status.activeCount} subscrição(ões) ativa(s)`,
    stale: false,
  };
}
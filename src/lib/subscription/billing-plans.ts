import type { SubscriptionTier } from "./tiers";

// Preços do sistema de pagamentos → plano do Afonso.
// Os ids são estáveis entre teste e produção (lookup_key).
export const PRICE_TO_TIER: Record<string, SubscriptionTier> = {
  consultor_monthly: "consultor",
  consultor_yearly: "consultor",
  pro_monthly: "pro",
  pro_yearly: "pro",
  team_monthly: "hub",
  team_yearly: "hub",
};

export type BillingInterval = "month" | "year";

export type PlanOffer = {
  tier: Exclude<SubscriptionTier, "base">;
  interval: BillingInterval;
  priceId: string;
  amountEur: number;
};

export const PLAN_OFFERS: PlanOffer[] = [
  { tier: "consultor", interval: "month", priceId: "consultor_monthly", amountEur: 14.9 },
  { tier: "consultor", interval: "year", priceId: "consultor_yearly", amountEur: 160.9 },
  { tier: "pro", interval: "month", priceId: "pro_monthly", amountEur: 24.9 },
  { tier: "pro", interval: "year", priceId: "pro_yearly", amountEur: 268.9 },
  { tier: "hub", interval: "month", priceId: "team_monthly", amountEur: 39.9 },
  { tier: "hub", interval: "year", priceId: "team_yearly", amountEur: 431 },
];

export function tierForPrice(priceId: string | null | undefined): SubscriptionTier | null {
  if (!priceId) return null;
  return PRICE_TO_TIER[priceId] ?? null;
}

// Estado de cobrança em português, para o painel.
export const BILLING_STATUS_LABEL: Record<string, string> = {
  none: "Sem subscrição",
  trialing: "Em período de teste",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  canceled: "Cancelada",
};

export const BILLING_SOURCE_LABEL: Record<string, string> = {
  manual: "Gestão manual",
  stripe: "Sincronização automática",
};
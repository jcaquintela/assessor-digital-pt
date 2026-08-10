import { tierForPrice } from "./billing-plans";
import type { SubscriptionTier } from "./tiers";

// Lógica pura de sincronização: recebe o evento de pagamento já verificado e o
// estado atual do perfil, e devolve o que deve (ou não) ser escrito na BD.
// Nenhuma escrita acontece aqui — o webhook aplica a decisão.

export type BillingStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export type ProfileBilling = {
  id: string;
  billing_source: "manual" | "stripe";
  billing_manual_lock: boolean;
};

export type BillingPatch = {
  billing_source?: "stripe";
  billing_status?: BillingStatus;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  subscription_tier?: SubscriptionTier;
};

export type SyncDecision =
  | { action: "skip"; reason: string }
  | { action: "update"; patch: BillingPatch; note: string };

function priceIdFromItem(item: any): string | null {
  return item?.price?.lookup_key ?? item?.price?.metadata?.lovable_external_id ?? item?.price?.id ?? null;
}

function statusFromStripe(status: string | null | undefined): BillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}

export function decideSync(
  event: { type: string; object: any },
  profile: ProfileBilling | null,
): SyncDecision {
  if (!profile) return { action: "skip", reason: "sem perfil correspondente" };

  // Contas em gestão manual (cortesias, betas, negociações) nunca são tocadas.
  if (profile.billing_manual_lock || profile.billing_source === "manual") {
    // Excepção: o próprio consultor concluir um checkout adota a sincronização,
    // salvo se a administração tiver travado a conta em manual.
    const adopting = event.type === "checkout.session.completed" && !profile.billing_manual_lock;
    if (!adopting) return { action: "skip", reason: "skipped: manual override" };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.object;
      return {
        action: "update",
        note: "checkout concluído",
        patch: {
          billing_source: "stripe",
          stripe_customer_id: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
          stripe_subscription_id:
            typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
        },
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.object;
      const item = sub.items?.data?.[0];
      const priceId = priceIdFromItem(item);
      const tier = tierForPrice(priceId);
      const status = statusFromStripe(sub.status);
      const patch: BillingPatch = {
        billing_status: status,
        stripe_subscription_id: sub.id ?? null,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
        stripe_price_id: priceId,
      };
      // Só damos plano quando a subscrição está boa; em atraso mantemos acesso
      // (o Stripe ainda está a tentar cobrar) e nunca cortamos automaticamente.
      if (tier && (status === "active" || status === "trialing")) patch.subscription_tier = tier;
      if (status === "canceled") patch.subscription_tier = "base";
      return { action: "update", patch, note: `subscrição ${status}` };
    }
    case "customer.subscription.deleted": {
      const sub = event.object;
      return {
        action: "update",
        note: "subscrição cancelada",
        patch: {
          billing_status: "canceled",
          stripe_subscription_id: sub.id ?? null,
          subscription_tier: "base",
        },
      };
    }
    case "invoice.payment_failed":
      return {
        action: "update",
        note: "pagamento falhado — acesso mantido",
        patch: { billing_status: "past_due" },
      };
    default:
      return { action: "skip", reason: `evento não tratado: ${event.type}` };
  }
}

// Como encontrar o perfil a partir do evento.
export function profileLookupFromEvent(event: { type: string; object: any }): {
  userId?: string;
  customerId?: string;
  subscriptionId?: string;
} {
  const o = event.object ?? {};
  const customer = typeof o.customer === "string" ? o.customer : o.customer?.id;
  if (event.type === "checkout.session.completed") {
    return {
      userId: o.client_reference_id ?? o.metadata?.userId ?? undefined,
      customerId: customer ?? undefined,
      subscriptionId: typeof o.subscription === "string" ? o.subscription : undefined,
    };
  }
  if (event.type.startsWith("customer.subscription.")) {
    return {
      userId: o.metadata?.userId ?? undefined,
      customerId: customer ?? undefined,
      subscriptionId: o.id ?? undefined,
    };
  }
  return {
    userId: o.subscription_details?.metadata?.userId ?? undefined,
    customerId: customer ?? undefined,
    subscriptionId: typeof o.subscription === "string" ? o.subscription : undefined,
  };
}
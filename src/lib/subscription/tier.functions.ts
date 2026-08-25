import { createServerFn } from "@tanstack/react-start";
import type { SubscriptionTier } from "./tiers";
import { getEffectiveTierForCurrentRequest } from "./tier.server";

// Devolve o tier efetivo do utilizador (aplica beta override) via RPC.
// Nunca ler `profiles.subscription_tier` directamente para gating —
// passa sempre por aqui / effective_tier() na BD.
export const getMyEffectiveTier = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ tier: SubscriptionTier }> => {
    return { tier: await getEffectiveTierForCurrentRequest() };
  });
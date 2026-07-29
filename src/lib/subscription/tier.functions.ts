import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTier, type SubscriptionTier } from "./tiers";

// Devolve o tier efetivo do utilizador (aplica beta override) via RPC.
// Nunca ler `profiles.subscription_tier` directamente para gating —
// passa sempre por aqui / effective_tier() na BD.
export const getMyEffectiveTier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tier: SubscriptionTier }> => {
    const { data, error } = await context.supabase.rpc("effective_tier", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { tier: normalizeTier(data as string | null) };
  });
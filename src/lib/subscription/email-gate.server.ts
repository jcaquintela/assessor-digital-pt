// Verificação do gate de Email no servidor. A UI esconde; isto bloqueia.
import { canUseEmailModule, EMAIL_PLAN_REQUIRED_ERROR } from "./email-gate";
import { normalizeTier, type SubscriptionTier } from "./tiers";

export async function effectiveTierOf(userId: string): Promise<SubscriptionTier> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("effective_tier", { _user_id: userId });
  if (error) throw new Error(error.message);
  return normalizeTier(data as string | null);
}

export async function hasEmailModule(userId: string): Promise<boolean> {
  return canUseEmailModule(await effectiveTierOf(userId));
}

/** Lança se o consultor não tiver plano para o módulo de Email. */
export async function requireEmailModule(userId: string): Promise<void> {
  if (!(await hasEmailModule(userId))) throw new Error(EMAIL_PLAN_REQUIRED_ERROR);
}

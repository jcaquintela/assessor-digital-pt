import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyProInsight, type FactualInsight } from "@/lib/insights/factual";
import { normalizeTier, tierAtLeast } from "@/lib/subscription/tiers";
import { computePeopleFacts } from "./insight.server";
import { peopleInsight } from "./insight";

export const getPeopleInsight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FactualInsight | null> => {
    const { data: tierRaw } = await context.supabase.rpc("effective_tier", { _user_id: context.userId });
    const tier = normalizeTier(tierRaw as string | null);
    if (!tierAtLeast(tier, "pro")) return null;

    const { items, extras } = await computePeopleFacts(context.supabase, context.userId);
    return applyProInsight(peopleInsight(items, extras), tier);
  });

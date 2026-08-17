import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computePropertyStalledItems } from "./insight.server";
import { applyProInsight, factualInsight, stalledFacts, type FactualInsight } from "@/lib/insights/factual";
import { normalizeTier } from "@/lib/subscription/tiers";

/** Régua dos imóveis: mais de 15 dias sem contacto real. */
export const IMOVEIS_MIN_DIAS = 15;

export const getPropertyInsight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FactualInsight | null> => {
    // Gate Pro pelo mesmo effective_tier() de todo o produto — decidido no
    // servidor, para nem sequer irmos buscar dados a quem não os vê.
    const { data: tierRaw } = await context.supabase.rpc("effective_tier", { _user_id: context.userId });
    const tier = normalizeTier(tierRaw as string | null);
    if (applyProInsight({} as FactualInsight, tier) === null) return null;

    const items = await computePropertyStalledItems(context.supabase, context.userId);
    return applyProInsight(
      factualInsight(stalledFacts(items, IMOVEIS_MIN_DIAS), {
        key: "imoveis-parados",
        noun: ["imóvel", "imóveis"],
        movimento: "última interação registada ou seguimento fechado ligado ao imóvel",
        linkLabel: "Ver imóveis →",
        to: "/imoveis",
      }),
      tier,
    );
  });
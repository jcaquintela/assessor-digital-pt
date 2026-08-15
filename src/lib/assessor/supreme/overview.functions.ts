import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMentor, computeOverview, type MentorTip } from "./overview.server";
import { applyMentorLevel, emptyFacts } from "./mentor-context";
import { resolveTierForRequest } from "@/lib/subscription/preview-tier.server";

// O Mentor NÃO tem gate de acesso: aparece em todos os planos. O que varia é a
// profundidade — nível 1 (simples) para Base, nível 2 (contextual) para
// Consultor e acima. Nível 3 ("Mentor Pleno", preditivo) fica por construir.
export const getHojeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { previewTier?: string | null } | undefined) => ({
    previewTier: typeof data?.previewTier === "string" ? data.previewTier : null,
  }))
  .handler(async ({ context, data }) => {
    const [summary, mentorResult, { tier, source }] = await Promise.all([
      computeOverview(context.supabase, context.userId),
      computeMentor(context.supabase, context.userId).catch(() => ({
        tip: null as MentorTip | null,
        facts: emptyFacts(),
      })),
      resolveTierForRequest(context.supabase, context.userId, data.previewTier),
    ]);

    const mentor = applyMentorLevel(mentorResult.tip, mentorResult.facts, tier) as MentorTip | null;
    return { summary, mentor, tierInfo: { effectiveTier: tier, source } };
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMentor, computeOverview, type MentorTip } from "./overview.server";
import { applyMentorLevel, emptyFacts } from "./mentor-context";
import { applyDecisions } from "./mentor-decisions";
import { loadMentorDecisions } from "./mentor-decisions.server";
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
    const [summary, mentorResult, { tier, source }, decisions] = await Promise.all([
      computeOverview(context.supabase, context.userId),
      computeMentor(context.supabase, context.userId).catch(() => ({
        tip: null as MentorTip | null,
        facts: emptyFacts(),
      })),
      resolveTierForRequest(context.supabase, context.userId, data.previewTier),
      loadMentorDecisions(context.supabase, context.userId).catch(() => []),
    ]);

    // A memória das decisões (Confirmar / Editar / Cancelar) manda: um sinal
    // decidido há pouco fica em silêncio e, quando volta, retoma o assunto.
    const decidido = applyDecisions(mentorResult.tip as MentorTip | null, decisions);
    const mentor = applyMentorLevel(decidido, mentorResult.facts, tier) as MentorTip | null;
    return { summary, mentor, tierInfo: { effectiveTier: tier, source }, decisions };
  });

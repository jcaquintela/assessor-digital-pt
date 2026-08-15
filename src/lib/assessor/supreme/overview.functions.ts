import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMentor, computeOverview, type MentorTip } from "./overview.server";
import { applyMentorLevel, emptyFacts } from "./mentor-context";

// O Mentor NÃO tem gate de acesso: aparece em todos os planos. O que varia é a
// profundidade — nível 1 (simples) para Base, nível 2 (contextual) para
// Consultor e acima. Nível 3 ("Mentor Pleno", preditivo) fica por construir.
export const getHojeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [summary, mentorResult, tier] = await Promise.all([
      computeOverview(context.supabase, context.userId),
      computeMentor(context.supabase, context.userId).catch(() => ({
        tip: null as MentorTip | null,
        facts: emptyFacts(),
      })),
      (async (): Promise<string | null> => {
        try {
          const { data } = await context.supabase.rpc("effective_tier", { _user_id: context.userId });
          return typeof data === "string" ? data : null;
        } catch {
          return null;
        }
      })(),
    ]);

    const mentor = applyMentorLevel(mentorResult.tip, mentorResult.facts, tier) as MentorTip | null;
    return { summary, mentor };
  });

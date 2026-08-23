import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NbaSuggestion } from "./next-best-action";

/** Próxima melhor ação — só usada quando o painel não tem prioridades. */
export const getNextBestAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ suggestion: NbaSuggestion | null }> => {
    const { computeNextBestAction } = await import("./next-best-action.server");
    const suggestion = await computeNextBestAction(context.supabase, context.userId);
    return { suggestion };
  });

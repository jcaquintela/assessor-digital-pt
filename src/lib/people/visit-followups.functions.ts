import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildVisitFollowUps, type VisitFollowUpCard } from "./visit-followups";
import { loadVisitSources } from "./visit-followups.server";

export const listVisitFollowUps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VisitFollowUpCard[]> => {
    const now = new Date();
    const since = new Date(now.getTime() - 14 * 864e5).toISOString();
    const src = await loadVisitSources(context.supabase, context.userId, since);
    return buildVisitFollowUps({ ...src, now, days: 14, limit: 6 });
  });

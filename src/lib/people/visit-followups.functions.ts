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

/** Concluir o seguimento da visita e, se houver, registar a nota curta. */
export const completeVisitFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    followUpId?: string | null;
    note?: string | null;
    personId?: string | null;
    propertyId?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { completeVisitFollowUpOnServer } = await import("./visit-followup-complete.server");
    return completeVisitFollowUpOnServer(context.supabase, context.userId, {
      followUpId: data.followUpId ?? null,
      note: data.note ?? null,
      personId: data.personId ?? null,
      propertyId: data.propertyId ?? null,
    });
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listOrphanOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchOrphanOpportunities } = await import("./origin-traceability.server");
    return fetchOrphanOpportunities(supabaseAdmin, {});
  });

export const searchOriginLeads = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ opportunityId: z.string().uuid(), query: z.string().max(120).default("") }).parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { searchLeadsForOpportunity } = await import("./origin-traceability.server");
    return searchLeadsForOpportunity(supabaseAdmin, data);
  });

export const setOpportunityOriginLead = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ opportunityId: z.string().uuid(), leadId: z.string().uuid().nullable() }).parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { setOpportunityOrigin } = await import("./origin-traceability.server");
    return setOpportunityOrigin(supabaseAdmin, context.userId, data);
  });

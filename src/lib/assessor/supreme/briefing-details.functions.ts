import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listBriefingItemDetails, type BriefingItemDetail } from "./briefing-details.server";

export type { BriefingItemDetail } from "./briefing-details.server";

export const getBriefingItemDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BriefingItemDetail[]> => {
    return listBriefingItemDetails(context.supabase, context.userId, 20);
  });

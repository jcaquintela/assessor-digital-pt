import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMentorTip, computeOverview } from "./overview.server";

export const getHojeOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [summary, mentor] = await Promise.all([
      computeOverview(context.supabase, context.userId),
      computeMentorTip(context.supabase, context.userId).catch(() => null),
    ]);
    return { summary, mentor };
  });

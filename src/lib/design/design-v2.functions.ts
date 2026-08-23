import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDesignV2Enabled } from "./design-v2.server";

/** Diz se este consultor vê o redesenho v2 (paleta operacional + sidebar de 5). */
export const getMyDesignV2 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ enabled: boolean }> => {
    const enabled = await isDesignV2Enabled(context.supabase, context.userId);
    return { enabled };
  });

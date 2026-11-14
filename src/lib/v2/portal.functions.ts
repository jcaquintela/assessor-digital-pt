import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { V2_MINIMAL_PORTAL_FLAG, V2_SELF_EXPORT_FLAG, type PortalMode } from "./portal-scope";

/** Modo do portal da conta autenticada. Qualquer falha = V1 (comportamento de hoje). */
export const getMyPortalMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ mode: PortalMode; exportEnabled: boolean }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { isAccountFlagEnabled } = await import("@/lib/flags/account-flag.server");
      const [portal, exp] = await Promise.all([
        isAccountFlagEnabled(supabaseAdmin, V2_MINIMAL_PORTAL_FLAG, context.userId),
        isAccountFlagEnabled(supabaseAdmin, V2_SELF_EXPORT_FLAG, context.userId),
      ]);
      return { mode: portal ? "v2_minimal" : "v1", exportEnabled: exp };
    } catch {
      return { mode: "v1", exportEnabled: false };
    }
  });

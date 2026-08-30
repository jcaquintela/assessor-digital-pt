import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Estado do arquivo em modo leitura (90 dias após descida de plano). */
export const getAccountMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadAccountMode, readOnlyArchiveNotice } = await import("./account-mode.server");
    const mode = await loadAccountMode(context.supabase, context.userId);
    return {
      ...mode,
      notice: mode.readOnlyArchive ? readOnlyArchiveNotice(mode.daysLeft, mode.tier) : null,
    };
  });
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listDiagConsultants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchConsultants } = await import("./diagnostico.server");
    return fetchConsultants(supabaseAdmin);
  });

export const getEngineDiagnostics = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchEngineDiagnostics } = await import("./diagnostico.server");
    return fetchEngineDiagnostics(supabaseAdmin, data);
  });

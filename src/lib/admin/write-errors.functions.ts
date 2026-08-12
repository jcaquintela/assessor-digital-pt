import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listWriteErrors = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ hours: z.number().int().positive().max(24 * 90) }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWriteErrors } = await import("./write-errors.server");
    return fetchWriteErrors(supabaseAdmin, { hours: data.hours });
  });

/** Contagem das últimas 24h, para o alerta e o badge do menu. */
export const countWriteErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWriteErrors } = await import("./write-errors.server");
    const { items, last24h } = await fetchWriteErrors(supabaseAdmin, { hours: 24, limit: 50 });
    const latest = items[0];
    return {
      last24h,
      latestTool: latest?.tool_name ?? null,
      latestError: latest?.error ?? null,
      latestAt: latest?.created_at ?? null,
    };
  });

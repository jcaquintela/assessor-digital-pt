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
    const { fetchWriteErrors, fetchModelFallbackTrend } = await import("./write-errors.server");
    const [res, modelTrend] = await Promise.all([
      fetchWriteErrors(supabaseAdmin, { hours: data.hours }),
      fetchModelFallbackTrend(supabaseAdmin),
    ]);
    return { ...res, modelTrend };
  });

/** Contagem das últimas 24h, para o alerta e o badge do menu. */
export const countWriteErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchWriteErrors } = await import("./write-errors.server");
    const { items, last24h, modelLast24h } = await fetchWriteErrors(supabaseAdmin, { hours: 24, limit: 50 });
    // O alerta/badge só reage a falhas de escrita — fallback do modelo não é alarme.
    const latest = items.find((i) => i.kind === "escrita");
    return {
      last24h,
      modelLast24h,
      latestTool: latest?.tool_name ?? null,
      latestError: latest?.error ?? null,
      latestAt: latest?.created_at ?? null,
    };
  });

/** Reexecuta uma escrita falhada com os mesmos argumentos (só falhas de ferramenta). */
export const retryWriteError = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { retryFailedWrite } = await import("./write-errors-retry.server");
    return retryFailedWrite(supabaseAdmin, context.userId, data.id);
  });

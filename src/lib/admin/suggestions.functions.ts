import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTeamSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchTeamSuggestions } = await import("./suggestions-list.server");
    return fetchTeamSuggestions(supabaseAdmin);
  });

export const updateTeamSuggestion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        source: z.enum(["feedback", "diversos"]),
        action: z.enum(["read", "unread", "archive"]),
        internalNote: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin, applySuggestionAction } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return applySuggestionAction(supabaseAdmin, context.userId, data);
  });

/** Contagem de sugestões por ler, para o alerta do admin. */
export const countUnreadTeamSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchTeamSuggestions } = await import("./suggestions-list.server");
    const { items } = await fetchTeamSuggestions(supabaseAdmin);
    const unread = items.filter((i) => !i.archived && !i.read_at);
    return {
      unread: unread.length,
      latestAt: unread[0]?.created_at ?? null,
      latestFrom: unread[0]?.consultant_name ?? unread[0]?.consultant_email ?? null,
    };
  });

const legacyUpdateTeamSuggestion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        source: z.enum(["feedback", "diversos"]),
        action: z.enum(["read", "unread", "archive"]),
        internalNote: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdmin, applySuggestionAction } = await import("./suggestions-actions.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return applySuggestionAction(supabaseAdmin, context.userId, data);
  });
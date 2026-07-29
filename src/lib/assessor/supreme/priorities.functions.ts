import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computePriorities, findAwaitingOutcome, persistPrioritiesSnapshot } from "./priorities.server";
import { isSupremeEnabled } from "./feature-flag.server";

export const getHojeSupreme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const enabled = await isSupremeEnabled(context.supabase, context.userId);
    if (!enabled) return { enabled: false, priorities: [], awaitingOutcome: [] };
    const priorities = await computePriorities(context.supabase, context.userId, { limit: 5 });
    await persistPrioritiesSnapshot(context.supabase, context.userId, priorities);
    const awaiting = await findAwaitingOutcome(context.supabase, context.userId);
    return { enabled: true, priorities, awaitingOutcome: awaiting };
  });

export const dismissPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ({ id: String((v as any)?.id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    await context.supabase
      .from("daily_priorities")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

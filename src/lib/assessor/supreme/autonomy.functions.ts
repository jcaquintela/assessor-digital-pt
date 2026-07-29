import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSupremeEnabled } from "./feature-flag.server";

const AUTONOMY_LEVELS = new Set(["conservador", "balanced", "proativo"]);

export const getSupremePreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const enabled = await isSupremeEnabled(context.supabase, context.userId);
    const [{ data: prefs }, { data: rules }] = await Promise.all([
      context.supabase
        .from("consultant_preferences")
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("autonomy_rules")
        .select("action_type, requires_confirmation")
        .eq("user_id", context.userId),
    ]);
    return {
      enabled,
      preferences: prefs ?? null,
      rules: (rules as any[]) ?? [],
    };
  });

export const updateSupremePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as {
      morning_briefing_enabled?: boolean;
      morning_time?: string;
      autonomy_level?: string;
      max_daily_nudges?: number;
    };
    const patch: Record<string, unknown> = {};
    if (typeof o.morning_briefing_enabled === "boolean") patch.morning_briefing_enabled = o.morning_briefing_enabled;
    if (typeof o.morning_time === "string" && /^\d{2}:\d{2}$/.test(o.morning_time)) patch.morning_time = o.morning_time;
    if (typeof o.autonomy_level === "string" && AUTONOMY_LEVELS.has(o.autonomy_level)) patch.autonomy_level = o.autonomy_level;
    if (typeof o.max_daily_nudges === "number" && o.max_daily_nudges >= 0 && o.max_daily_nudges <= 20) {
      patch.max_daily_nudges = Math.floor(o.max_daily_nudges);
    }
    return patch;
  })
  .handler(async ({ context, data }) => {
    if (!Object.keys(data).length) return { ok: true };
    const { error } = await context.supabase
      .from("consultant_preferences")
      .upsert({ user_id: context.userId, ...data } as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAutonomyRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as { action_type?: string; requires_confirmation?: boolean };
    return {
      action_type: String(o.action_type ?? ""),
      requires_confirmation: Boolean(o.requires_confirmation),
    };
  })
  .handler(async ({ context, data }) => {
    // Blacklist absoluta: nunca permitir false para acções sensíveis
    const BLACKLIST = new Set([
      "merge_person", "merge_property", "update_price", "update_owner", "cancel_event",
      "delete_entity", "send_message_to_client", "financial_action", "create_person", "create_property",
    ]);
    if (!data.action_type) throw new Error("action_type required");
    const requires = BLACKLIST.has(data.action_type) ? true : data.requires_confirmation;
    const { error } = await context.supabase
      .from("autonomy_rules")
      .upsert(
        { user_id: context.userId, action_type: data.action_type, requires_confirmation: requires } as never,
        { onConflict: "user_id,action_type" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

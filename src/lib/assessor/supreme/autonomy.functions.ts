import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSupremeEnabled } from "./feature-flag.server";
import {
  AUTONOMY_CAP_BY_TIER,
  allowedAutonomyLevels,
  capAutonomy,
  isAutonomyLevel,
  normalizeTier,
  type AutonomyLevel,
  type SubscriptionTier,
} from "@/lib/subscription/tiers";

async function fetchEffectiveTier(supabase: any, userId: string): Promise<SubscriptionTier> {
  const { data } = await supabase.rpc("effective_tier", { _user_id: userId });
  return normalizeTier(data as string | null);
}

export const getSupremePreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const enabled = await isSupremeEnabled(context.supabase, context.userId);
    const [{ data: prefs }, { data: rules }, tier] = await Promise.all([
      context.supabase
        .from("consultant_preferences")
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("autonomy_rules")
        .select("action_type, requires_confirmation")
        .eq("user_id", context.userId),
      fetchEffectiveTier(context.supabase, context.userId),
    ]);
    const stored = (prefs as { autonomy_level?: string } | null)?.autonomy_level;
    const effectiveAutonomy = capAutonomy(stored, tier);
    return {
      enabled,
      preferences: prefs ?? null,
      rules: (rules as any[]) ?? [],
      tier,
      autonomyCap: AUTONOMY_CAP_BY_TIER[tier],
      autonomyAllowed: allowedAutonomyLevels(tier),
      effectiveAutonomy,
      autonomyClamped: isAutonomyLevel(stored) && stored !== effectiveAutonomy,
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
      proactive_push_enabled?: boolean;
      evening_checkin_enabled?: boolean;
      evening_checkin_time?: string;
    };
    const patch: Record<string, unknown> = {};
    if (typeof o.morning_briefing_enabled === "boolean") patch.morning_briefing_enabled = o.morning_briefing_enabled;
    if (typeof o.morning_time === "string" && /^\d{2}:\d{2}$/.test(o.morning_time)) patch.morning_time = o.morning_time;
    if (typeof o.proactive_push_enabled === "boolean") patch.proactive_push_enabled = o.proactive_push_enabled;
    if (typeof o.evening_checkin_enabled === "boolean") patch.evening_checkin_enabled = o.evening_checkin_enabled;
    if (typeof o.evening_checkin_time === "string" && /^\d{2}:\d{2}$/.test(o.evening_checkin_time)) {
      patch.evening_checkin_time = o.evening_checkin_time;
    }
    if (isAutonomyLevel(o.autonomy_level)) patch.autonomy_level = o.autonomy_level;
    if (typeof o.max_daily_nudges === "number" && o.max_daily_nudges >= 0 && o.max_daily_nudges <= 20) {
      patch.max_daily_nudges = Math.floor(o.max_daily_nudges);
    }
    return patch;
  })
  .handler(async ({ context, data }) => {
    if (!Object.keys(data).length) return { ok: true };
    // Teto por tier: se o utilizador tenta subir acima do permitido,
    // recusamos com erro claro (a UI já esconde as opções, mas o backend
    // é a fonte de verdade). Ignoramos o campo se estiver acima do teto.
    if (typeof (data as any).autonomy_level === "string") {
      const tier = await fetchEffectiveTier(context.supabase, context.userId);
      const allowed = new Set<AutonomyLevel>(allowedAutonomyLevels(tier));
      if (!allowed.has((data as any).autonomy_level as AutonomyLevel)) {
        throw new Error(
          `O teu plano (${tier}) não permite este nível de autonomia. Máximo: ${AUTONOMY_CAP_BY_TIER[tier]}.`,
        );
      }
    }
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

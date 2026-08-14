import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_REMINDER_LEAD_MINUTES,
  MAX_REMINDER_LEAD_MINUTES,
  normalizeLeadMinutes,
} from "@/lib/assessor/reminders/lead-time";
import { REMINDER_LEAD_SETTING_KEY } from "@/lib/assessor/reminders/lead-time.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as any[]) ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const getGlobalReminderLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("app_settings")
      .select("value_int, updated_at")
      .eq("key", REMINDER_LEAD_SETTING_KEY)
      .maybeSingle();
    return {
      minutes: normalizeLeadMinutes((data as any)?.value_int) ?? DEFAULT_REMINDER_LEAD_MINUTES,
      updated_at: (data as any)?.updated_at ?? null,
    };
  });

export const setGlobalReminderLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const raw = Number((v as { minutes?: unknown } | null)?.minutes);
    const n = normalizeLeadMinutes(raw);
    if (n === null) {
      throw new Error(`Indica um valor entre 0 e ${MAX_REMINDER_LEAD_MINUTES} minutos.`);
    }
    return { minutes: n };
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("app_settings")
      .upsert(
        { key: REMINDER_LEAD_SETTING_KEY, value_int: data.minutes, updated_at: new Date().toISOString() } as never,
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, minutes: data.minutes };
  });

import {
  DEFAULT_REMINDER_LEAD_MINUTES,
  applyLead,
  resolveLeadMinutes,
} from "./lead-time";

export const REMINDER_LEAD_SETTING_KEY = "reminder_lead_minutes";

/** Antecedência efectiva (minutos) para os lembretes deste consultor. */
export async function getReminderLeadMinutes(
  supabase: any,
  userId: string,
): Promise<number> {
  try {
    const [{ data: prefs }, { data: global }] = await Promise.all([
      supabase
        .from("consultant_preferences")
        .select("reminder_lead_minutes")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("app_settings")
        .select("value_int")
        .eq("key", REMINDER_LEAD_SETTING_KEY)
        .maybeSingle(),
    ]);
    return resolveLeadMinutes(
      (prefs as any)?.reminder_lead_minutes ?? null,
      (global as any)?.value_int ?? null,
    );
  } catch {
    return DEFAULT_REMINDER_LEAD_MINUTES;
  }
}

/** Instante em que o aviso deve sair, dado o instante do compromisso. */
export async function reminderInstantFor(
  supabase: any,
  userId: string,
  eventIsoUtc: string,
): Promise<string> {
  const lead = await getReminderLeadMinutes(supabase, userId);
  return applyLead(eventIsoUtc, lead);
}

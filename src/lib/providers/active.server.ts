// Leitura/escrita do provedor ativo por modalidade. Server-only.
import { resolveActiveProvider, type ActiveResolution } from "./active";
import { CALENDAR_PROVIDERS, type CalendarProvider } from "@/lib/calendar/providers";
import { MAIL_CONNECTOR_ID, MAIL_PROVIDERS, type MailProvider } from "@/lib/email/providers";

async function readPrefs(userId: string): Promise<{
  active_calendar_provider: string | null;
  active_mail_provider: string | null;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("consultant_preferences")
    .select("active_calendar_provider, active_mail_provider")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    active_calendar_provider: (data as any)?.active_calendar_provider ?? null,
    active_mail_provider: (data as any)?.active_mail_provider ?? null,
  };
}

/** Calendários com ligação real (chave no gateway). */
export async function connectedCalendarProviders(userId: string): Promise<CalendarProvider[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getConnectionKeyForUser } = await import("@/lib/calendar/connections.server");
  const out: CalendarProvider[] = [];
  for (const p of CALENDAR_PROVIDERS) {
    if (await getConnectionKeyForUser(supabaseAdmin, userId, p)) out.push(p);
  }
  return out;
}

export async function activeCalendar(userId: string): Promise<ActiveResolution<CalendarProvider>> {
  const [connected, prefs] = await Promise.all([
    connectedCalendarProviders(userId),
    readPrefs(userId),
  ]);
  const chosen = prefs.active_calendar_provider as CalendarProvider | null;
  return resolveActiveProvider(connected, chosen);
}

/** Caixas de correio com ligação real, com a chave do gateway já resolvida. */
export async function connectedMailProviders(
  userId: string,
): Promise<Array<{ provider: MailProvider; key: string }>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getConnectionKeyForUser } = await import("@/lib/calendar/connections.server");
  const { data } = await supabaseAdmin
    .from("email_connections")
    .select("provider")
    .eq("user_id", userId);
  const declared = new Set(
    ((data ?? []) as Array<{ provider: string }>).map((r) => String(r.provider)),
  );
  const out: Array<{ provider: MailProvider; key: string }> = [];
  for (const p of MAIL_PROVIDERS) {
    if (!declared.has(p)) continue;
    const key = await getConnectionKeyForUser(supabaseAdmin, userId, MAIL_CONNECTOR_ID[p]);
    if (key) out.push({ provider: p, key });
  }
  return out;
}

export async function activeMail(
  userId: string,
): Promise<ActiveResolution<MailProvider> & { key?: string }> {
  const [conns, prefs] = await Promise.all([connectedMailProviders(userId), readPrefs(userId)]);
  const res = resolveActiveProvider(
    conns.map((c) => c.provider),
    prefs.active_mail_provider as MailProvider | null,
  );
  if (res.status !== "ok") return res;
  return { ...res, key: conns.find((c) => c.provider === res.provider)!.key };
}

export async function setActiveProvider(
  userId: string,
  modality: "calendar" | "mail",
  provider: string | null,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const column = modality === "calendar" ? "active_calendar_provider" : "active_mail_provider";
  const { error } = await supabaseAdmin
    .from("consultant_preferences")
    .upsert({ user_id: userId, [column]: provider }, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * Quando um provedor é ligado e é o único da modalidade, fica ativo sem
 * perguntar nada — o comportamento não muda para quem só usa um.
 */
export async function ensureActiveAfterConnect(
  userId: string,
  modality: "calendar" | "mail",
): Promise<void> {
  const prefs = await readPrefs(userId);
  const current = modality === "calendar"
    ? prefs.active_calendar_provider
    : prefs.active_mail_provider;
  if (current) return;
  const connected = modality === "calendar"
    ? await connectedCalendarProviders(userId)
    : (await connectedMailProviders(userId)).map((c) => c.provider);
  if (connected.length === 1) await setActiveProvider(userId, modality, connected[0]!);
}

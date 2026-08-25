// Sincronização bidirecional Afonso <-> Google Calendar / Microsoft Outlook.
//
// Estratégia acordada:
//  - Afonso -> Calendar: imediato (chamado pelos Domain Services).
//  - Calendar -> Afonso: polling periódico (cron), com syncToken (Google) e
//    deltaLink (Microsoft) para pedir só o que mudou.
//  - Conflito: last-write-wins por timestamp. O lado com alteração mais
//    recente ganha; a origem fica registada em `calendar_sync_log`.
//
// Todas as chamadas ao provider passam pelo connector gateway (tokens ficam
// do lado do gateway, nunca na app).
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "./connections.server";
import { isCalendarAuthError } from "./auth-error";
import { isExternalEventMissing } from "./missing-event";
import {
  CALENDAR_PROVIDERS,
  GATEWAY_BASE_URL,
  type CalendarProvider,
} from "./providers";
import { isAgendaEvent } from "@/lib/agenda-kind";

const DEFAULT_DURATION_MIN = 60;
const TZ = "Europe/Lisbon";

export interface LocalEvent {
  id: string;
  title: string;
  notes: string | null;
  due_date: string; // instante ISO
  due_time: string | null;
  status: string | null;
  type: string | null;
  updated_at: string | null;
  archived_at?: string | null;
}

function lisbonHhMm(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function endIso(startIso: string): string {
  return new Date(new Date(startIso).getTime() + DEFAULT_DURATION_MIN * 60_000).toISOString();
}

async function logSync(
  supabaseAdmin: any,
  row: {
    userId: string; provider: string; followUpId?: string | null;
    externalEventId?: string | null; direction: "outbound" | "inbound";
    action: string; origin: string; detail?: string | null;
  },
) {
  try {
    await supabaseAdmin.from("calendar_sync_log").insert({
      user_id: row.userId,
      provider: row.provider,
      follow_up_id: row.followUpId ?? null,
      external_event_id: row.externalEventId ?? null,
      direction: row.direction,
      action: row.action,
      origin: row.origin,
      detail: row.detail ?? null,
    });
  } catch { /* telemetria nunca quebra o fluxo */ }
}

/* ============================ Mapeamento ============================ */

export function toGoogleBody(ev: LocalEvent) {
  const { startIso, endIso: end } = outboundWindow(ev);
  return {
    summary: ev.title,
    description: ev.notes ?? undefined,
    start: { dateTime: startIso, timeZone: TZ },
    end: { dateTime: end, timeZone: TZ },
  };
}

export function toOutlookBody(ev: LocalEvent) {
  const { startIso, endIso: end } = outboundWindow(ev);
  return {
    subject: ev.title,
    body: { contentType: "Text", content: ev.notes ?? "" },
    start: { dateTime: startIso.replace("Z", ""), timeZone: "UTC" },
    end: { dateTime: end.replace("Z", ""), timeZone: "UTC" },
  };
}

/* ====================== Afonso -> Calendar ========================== */

async function fetchLocalEvent(supabaseAdmin: any, userId: string, followUpId: string): Promise<LocalEvent | null> {
  const { data } = await supabaseAdmin
    .from("follow_ups")
    .select("id, title, notes, due_date, due_time, status, type, updated_at, archived_at")
    .eq("id", followUpId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as LocalEvent | null) ?? null;
}

async function getLink(supabaseAdmin: any, userId: string, provider: CalendarProvider, followUpId: string) {
  const { data } = await supabaseAdmin
    .from("calendar_event_links")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("follow_up_id", followUpId)
    .maybeSingle();
  return (data as any) ?? null;
}

async function callProvider(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  path: string, init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: any; text: string }> {
  const connectionAPIKey = await getConnectionKeyForUser(supabaseAdmin, userId, provider);
  if (!connectionAPIKey) return { ok: false, status: 0, body: null, text: "not_connected" };
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: provider,
    path,
    init,
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* resposta vazia */ }
  // Autorização caducada ou revogada: fica registado para a UI poder oferecer
  // "Voltar a ligar" em vez de tentar sincronizar em vão.
  if (!res.ok && isCalendarAuthError(res.status, text)) {
    await saveSyncState(supabaseAdmin, userId, provider, {
      last_error: `${res.status}: ${text.slice(0, 200)}`,
    });
  }
  return { ok: res.ok, status: res.status, body, text };
}

function jsonInit(method: string, payload: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}

/**
 * Escreve o compromisso do Afonso APENAS no calendário ativo do consultor.
 * Nada de fan-out: com dois calendários ligados e sem escolha feita, não
 * escrevemos em lado nenhum (o motor pede a escolha antes de agir).
 * Nunca lança — falhar a sincronização não pode quebrar a criação do evento.
 */
export async function pushEventToProviders(
  opts: { userId: string; followUpId: string; action: "upsert" | "delete" },
): Promise<void> {
  try {
    // Usa sempre o cliente de serviço: `app_user_connections` é server-only.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ev = opts.action === "delete" ? null : await fetchLocalEvent(supabaseAdmin, opts.userId, opts.followUpId);
    if (opts.action === "upsert") {
      if (!ev) return;
      // Só compromissos de agenda vão para o calendário — tarefas não.
      if (!isAgendaEvent(ev.type, ev.due_time)) return;
      if (ev.status === "cancelado") return;
    }
    // Apagar tem de limpar o que já existe em qualquer provedor: um evento
    // importado do Google não pode ficar órfão só porque o ativo é outro.
    if (opts.action === "delete") {
      for (const provider of CALENDAR_PROVIDERS) {
        const key = await getConnectionKeyForUser(supabaseAdmin, opts.userId, provider);
        if (!key) continue;
        await pushOne(supabaseAdmin, opts.userId, provider, opts.followUpId, ev, opts.action);
      }
      return;
    }
    const { activeCalendar } = await import("@/lib/providers/active.server");
    const active = await activeCalendar(opts.userId);
    const providers: CalendarProvider[] = active.status === "ok" ? [active.provider] : [];
    // Evento importado de outro provedor: mantemos a atualização no provedor
    // de origem em vez de o duplicar no ativo (comportamento previsível).
    const origin = await originProviderOf(supabaseAdmin, opts.userId, opts.followUpId);
    if (origin && !providers.includes(origin)) providers.length = 0, providers.push(origin);
    for (const provider of providers) {
      const connectionAPIKey = await getConnectionKeyForUser(supabaseAdmin, opts.userId, provider);
      if (!connectionAPIKey) continue;
      await pushOne(supabaseAdmin, opts.userId, provider, opts.followUpId, ev, opts.action);
    }
  } catch (e) {
    console.error("[calendar-sync] push falhou", e);
  }
}

/** Provedor onde este compromisso já existe (importado ou criado antes). */
async function originProviderOf(
  supabaseAdmin: any, userId: string, followUpId: string,
): Promise<CalendarProvider | null> {
  const { data } = await supabaseAdmin
    .from("calendar_event_links")
    .select("provider, deleted")
    .eq("user_id", userId)
    .eq("follow_up_id", followUpId);
  const row = ((data ?? []) as Array<{ provider: string; deleted: boolean | null }>)
    .find((r) => !r.deleted);
  const p = row?.provider;
  return p === "google_calendar" || p === "microsoft_outlook" ? p : null;
}

async function pushOne(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  followUpId: string, ev: LocalEvent | null, action: "upsert" | "delete",
) {
  const link = await getLink(supabaseAdmin, userId, provider, followUpId);
  const isGoogle = provider === "google_calendar";

  if (action === "delete") {
    if (!link?.external_event_id) return;
    const path = isGoogle
      ? `/calendar/v3/calendars/primary/events/${encodeURIComponent(link.external_event_id)}`
      : `/me/events/${encodeURIComponent(link.external_event_id)}`;
    const r = await callProvider(supabaseAdmin, userId, provider, path, { method: "DELETE" });
    await supabaseAdmin.from("calendar_event_links")
      .update({ deleted: true, last_origin: "afonso", last_synced_at: new Date().toISOString() })
      .eq("id", link.id);
    await logSync(supabaseAdmin, {
      userId, provider, followUpId, externalEventId: link.external_event_id,
      direction: "outbound", action: "delete", origin: "afonso",
      detail: r.ok ? null : `${r.status}: ${r.text.slice(0, 200)}`,
    });
    return;
  }

  if (!ev) return;
  const payload = isGoogle ? toGoogleBody(ev) : toOutlookBody(ev);

  if (link?.external_event_id && !link.deleted) {
    const path = isGoogle
      ? `/calendar/v3/calendars/primary/events/${encodeURIComponent(link.external_event_id)}`
      : `/me/events/${encodeURIComponent(link.external_event_id)}`;
    const r = await callProvider(supabaseAdmin, userId, provider, path, jsonInit(isGoogle ? "PATCH" : "PATCH", payload));
    await supabaseAdmin.from("calendar_event_links").update({
      local_updated_at: ev.updated_at ?? new Date().toISOString(),
      external_updated_at: isGoogle ? r.body?.updated ?? null : r.body?.lastModifiedDateTime ?? null,
      last_origin: "afonso",
      last_synced_at: new Date().toISOString(),
    }).eq("id", link.id);
    await logSync(supabaseAdmin, {
      userId, provider, followUpId, externalEventId: link.external_event_id,
      direction: "outbound", action: "update", origin: "afonso",
      detail: r.ok ? null : `${r.status}: ${r.text.slice(0, 200)}`,
    });
    return;
  }

  const createPath = isGoogle ? "/calendar/v3/calendars/primary/events" : "/me/events";
  const r = await callProvider(supabaseAdmin, userId, provider, createPath, jsonInit("POST", payload));
  const externalId = r.body?.id as string | undefined;
  if (!r.ok || !externalId) {
    await logSync(supabaseAdmin, {
      userId, provider, followUpId, direction: "outbound", action: "create", origin: "afonso",
      detail: `${r.status}: ${r.text.slice(0, 200)}`,
    });
    return;
  }
  await supabaseAdmin.from("calendar_event_links").upsert({
    user_id: userId,
    provider,
    follow_up_id: followUpId,
    external_event_id: externalId,
    external_calendar_id: isGoogle ? "primary" : null,
    external_updated_at: isGoogle ? r.body?.updated ?? null : r.body?.lastModifiedDateTime ?? null,
    local_updated_at: ev.updated_at ?? new Date().toISOString(),
    last_origin: "afonso",
    deleted: false,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider,follow_up_id" });
  await logSync(supabaseAdmin, {
    userId, provider, followUpId, externalEventId: externalId,
    direction: "outbound", action: "create", origin: "afonso",
  });
}

/* ====================== Calendar -> Afonso ========================== */

interface ExternalEvent {
  id: string;
  title: string | null;
  notes: string | null;
  startIso: string | null;
  updatedIso: string | null;
  cancelled: boolean;
}

function normalizeGoogle(item: any): ExternalEvent {
  const start = item?.start?.dateTime ?? (item?.start?.date ? `${item.start.date}T09:00:00Z` : null);
  return {
    id: String(item?.id ?? ""),
    title: item?.summary ?? null,
    notes: item?.description ?? null,
    startIso: start ? new Date(start).toISOString() : null,
    updatedIso: item?.updated ? new Date(item.updated).toISOString() : null,
    cancelled: item?.status === "cancelled",
  };
}

function normalizeOutlook(item: any): ExternalEvent {
  const raw = item?.start?.dateTime as string | undefined;
  const tz = item?.start?.timeZone as string | undefined;
  let startIso: string | null = null;
  if (raw) {
    const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}${tz === "UTC" || !tz ? "Z" : "Z"}`;
    const d = new Date(withZone);
    startIso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return {
    id: String(item?.id ?? ""),
    title: item?.subject ?? null,
    notes: item?.bodyPreview ?? null,
    startIso,
    updatedIso: item?.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).toISOString() : null,
    cancelled: !!item?.["@removed"] || item?.isCancelled === true,
  };
}

async function getSyncState(supabaseAdmin: any, userId: string, provider: CalendarProvider) {
  const { data } = await supabaseAdmin
    .from("calendar_sync_state")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as any) ?? null;
}

async function saveSyncState(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  patch: Record<string, unknown>,
) {
  await supabaseAdmin.from("calendar_sync_state").upsert({
    user_id: userId,
    provider,
    last_polled_at: new Date().toISOString(),
    ...patch,
  }, { onConflict: "user_id,provider" });
}

/** Descarrega as alterações desde a última verificação. */
async function fetchChanges(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
): Promise<{ events: ExternalEvent[]; nextToken?: string | null; nextDelta?: string | null; error?: string }> {
  const state = await getSyncState(supabaseAdmin, userId, provider);
  const events: ExternalEvent[] = [];

  if (provider === "google_calendar") {
    let path: string;
    if (state?.sync_token) {
      path = `/calendar/v3/calendars/primary/events?showDeleted=true&singleEvents=true&maxResults=250&syncToken=${encodeURIComponent(state.sync_token)}`;
    } else {
      const timeMin = new Date(Date.now() - 7 * 86_400_000).toISOString();
      path = `/calendar/v3/calendars/primary/events?showDeleted=true&singleEvents=true&maxResults=250&timeMin=${encodeURIComponent(timeMin)}`;
    }
    const r = await callProvider(supabaseAdmin, userId, provider, path);
    if (!r.ok) {
      // syncToken expirado (410) -> recomeçar sem token na próxima ronda.
      if (r.status === 410) await saveSyncState(supabaseAdmin, userId, provider, { sync_token: null });
      return { events: [], error: `${r.status}: ${r.text.slice(0, 200)}` };
    }
    for (const it of r.body?.items ?? []) events.push(normalizeGoogle(it));
    return { events, nextToken: r.body?.nextSyncToken ?? state?.sync_token ?? null };
  }

  // Microsoft Graph delta
  let path: string;
  if (state?.delta_link) {
    path = state.delta_link.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, "");
  } else {
    const start = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const end = new Date(Date.now() + 180 * 86_400_000).toISOString();
    path = `/me/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`;
  }
  const r = await callProvider(supabaseAdmin, userId, provider, path, {
    headers: { Prefer: "odata.maxpagesize=200" },
  });
  if (!r.ok) {
    if (r.status === 410) await saveSyncState(supabaseAdmin, userId, provider, { delta_link: null });
    return { events: [], error: `${r.status}: ${r.text.slice(0, 200)}` };
  }
  for (const it of r.body?.value ?? []) events.push(normalizeOutlook(it));
  return { events, nextDelta: r.body?.["@odata.deltaLink"] ?? state?.delta_link ?? null };
}

/**
 * Aplica no Afonso as alterações vindas do calendário externo.
 * Conflito: ganha o timestamp mais recente (last-write-wins).
 */
export async function pullFromProvider(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
): Promise<{ applied: number; skipped: number; error?: string }> {
  const connectionAPIKey = await getConnectionKeyForUser(supabaseAdmin, userId, provider);
  if (!connectionAPIKey) return { applied: 0, skipped: 0, error: "not_connected" };

  const { events, nextToken, nextDelta, error } = await fetchChanges(supabaseAdmin, userId, provider);
  if (error) {
    await saveSyncState(supabaseAdmin, userId, provider, { last_error: error });
    // Mesmo com o delta a falhar, confirmamos os eventos ligados: uma remoção
    // no calendário não pode ficar por detectar só porque o token caducou.
    const applied = await verifyLinkedEvents(supabaseAdmin, userId, provider);
    return { applied, skipped: 0, error };
  }

  let applied = 0;
  let skipped = 0;

  for (const ext of events) {
    if (!ext.id) continue;
    const { data: link } = await supabaseAdmin
      .from("calendar_event_links")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("external_event_id", ext.id)
      .maybeSingle();

    // Eco da nossa própria escrita — nada a fazer.
    if (link && ext.updatedIso && link.external_updated_at
        && new Date(ext.updatedIso).getTime() <= new Date(link.external_updated_at).getTime()) {
      skipped++;
      continue;
    }

    if (ext.cancelled) {
      if (link?.follow_up_id) {
        await supabaseAdmin.from("follow_ups")
          .update({ status: "cancelado", archived_at: new Date().toISOString() })
          .eq("id", link.follow_up_id).eq("user_id", userId);
        // Sem isto, o aviso interno das 11h continuava a sair mesmo depois de
        // o evento ter sido cancelado no calendário.
        await supabaseAdmin.from("reminders")
          .update({ status: "cancelled" })
          .eq("user_id", userId)
          .eq("related_resource_type", "follow_up")
          .eq("related_resource_id", link.follow_up_id)
          .in("status", ["scheduled", "processing", "failed"]);
        await supabaseAdmin.from("calendar_event_links")
          .update({ deleted: true, last_origin: provider, external_updated_at: ext.updatedIso, last_synced_at: new Date().toISOString() })
          .eq("id", link.id);
        await logSync(supabaseAdmin, {
          userId, provider, followUpId: link.follow_up_id, externalEventId: ext.id,
          direction: "inbound", action: "delete", origin: provider,
        });
        applied++;
      }
      continue;
    }

    if (!ext.startIso || !ext.title) { skipped++; continue; }

    if (link?.follow_up_id) {
      const local = await fetchLocalEvent(supabaseAdmin, userId, link.follow_up_id);
      // O consultor já desmarcou/arquivou este compromisso no Afonso: não o
      // ressuscitamos com o que vem do calendário — apagamos lá fora.
      const settledLocally = !!local
        && (!!local.archived_at
          || ["cancelado", "cancelada", "arquivado"].includes(String(local.status ?? "").toLowerCase()));
      if (settledLocally) {
        await pushOne(supabaseAdmin, userId, provider, link.follow_up_id, null, "delete");
        await logSync(supabaseAdmin, {
          userId, provider, followUpId: link.follow_up_id, externalEventId: ext.id,
          direction: "inbound", action: "delete", origin: "afonso",
          detail: "arquivado no Afonso: removido do calendário",
        });
        applied++;
        continue;
      }
      const localT = local?.updated_at ? new Date(local.updated_at).getTime() : 0;
      const extT = ext.updatedIso ? new Date(ext.updatedIso).getTime() : Date.now();
      if (localT > extT) {
        // O Afonso é mais recente: ganha e reescreve o lado externo.
        await pushOne(supabaseAdmin, userId, provider, link.follow_up_id, local, "upsert");
        await logSync(supabaseAdmin, {
          userId, provider, followUpId: link.follow_up_id, externalEventId: ext.id,
          direction: "inbound", action: "conflict", origin: "afonso",
          detail: "last-write-wins: alteração local mais recente",
        });
        skipped++;
        continue;
      }
      await supabaseAdmin.from("follow_ups").update({
        title: ext.title,
        notes: ext.notes ?? local?.notes ?? null,
        due_date: ext.startIso,
        due_time: lisbonHhMm(ext.startIso),
        status: "agendado",
      }).eq("id", link.follow_up_id).eq("user_id", userId);
      await supabaseAdmin.from("calendar_event_links").update({
        external_updated_at: ext.updatedIso,
        last_origin: provider,
        deleted: false,
        last_synced_at: new Date().toISOString(),
      }).eq("id", link.id);
      await logSync(supabaseAdmin, {
        userId, provider, followUpId: link.follow_up_id, externalEventId: ext.id,
        direction: "inbound", action: "update", origin: provider,
      });
      applied++;
      continue;
    }

    // Evento novo criado directamente no Google/Outlook.
    const { data: created } = await supabaseAdmin.from("follow_ups").insert({
      user_id: userId,
      title: ext.title,
      type: "evento",
      due_date: ext.startIso,
      due_time: lisbonHhMm(ext.startIso),
      status: "agendado",
      priority: "media",
      notes: ext.notes ?? null,
      timezone: TZ,
      source_channel: provider,
      external_reference: ext.id,
      created_by_assessor: false,
    }).select("id").single();
    const followUpId = (created as { id: string } | null)?.id;
    if (!followUpId) { skipped++; continue; }
    await supabaseAdmin.from("calendar_event_links").upsert({
      user_id: userId,
      provider,
      follow_up_id: followUpId,
      external_event_id: ext.id,
      external_calendar_id: provider === "google_calendar" ? "primary" : null,
      external_updated_at: ext.updatedIso,
      local_updated_at: new Date().toISOString(),
      last_origin: provider,
      deleted: false,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider,follow_up_id" });
    await logSync(supabaseAdmin, {
      userId, provider, followUpId, externalEventId: ext.id,
      direction: "inbound", action: "create", origin: provider,
    });
    applied++;
  }

  await saveSyncState(supabaseAdmin, userId, provider, {
    sync_token: nextToken ?? undefined,
    delta_link: nextDelta ?? undefined,
    last_error: null,
  });
  applied += await verifyLinkedEvents(supabaseAdmin, userId, provider);
  return { applied, skipped };
}

/**
 * Confirma, evento a evento, que os compromissos ligados ainda existem no
 * calendário externo. Cobre o caso em que o consultor apaga directamente no
 * Outlook/Google e o delta não nos traz a remoção.
 */
async function verifyLinkedEvents(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("calendar_event_links")
    .select("id, external_event_id, follow_up_id, follow_ups!inner(id, due_date, status, archived_at)")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("deleted", false)
    .gte("follow_ups.due_date", since)
    .limit(50);
  const links = (data ?? []) as any[];
  let cancelled = 0;
  const isGoogle = provider === "google_calendar";
  for (const link of links) {
    const fu = link.follow_ups;
    if (!link.external_event_id || !link.follow_up_id) continue;
    if (fu?.archived_at || String(fu?.status ?? "").toLowerCase() === "cancelado") continue;
    const path = isGoogle
      ? `/calendar/v3/calendars/primary/events/${encodeURIComponent(link.external_event_id)}`
      : `/me/events/${encodeURIComponent(link.external_event_id)}`;
    const r = await callProvider(supabaseAdmin, userId, provider, path);
    if (!isExternalEventMissing(r.status, r.body, r.text)) continue;
    await cancelLocalEvent(supabaseAdmin, userId, provider, link.follow_up_id, link.id, link.external_event_id);
    cancelled++;
  }
  return cancelled;
}

/** Cancela no Afonso um compromisso que desapareceu do calendário externo. */
async function cancelLocalEvent(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  followUpId: string, linkId: string, externalEventId: string,
) {
  await supabaseAdmin.from("follow_ups")
    .update({ status: "cancelado", archived_at: new Date().toISOString() })
    .eq("id", followUpId).eq("user_id", userId);
  await supabaseAdmin.from("reminders")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("related_resource_type", "follow_up")
    .eq("related_resource_id", followUpId)
    .in("status", ["scheduled", "processing", "failed"]);
  await supabaseAdmin.from("calendar_event_links")
    .update({ deleted: true, last_origin: provider, last_synced_at: new Date().toISOString() })
    .eq("id", linkId);
  await logSync(supabaseAdmin, {
    userId, provider, followUpId, externalEventId,
    direction: "inbound", action: "delete", origin: provider,
    detail: "apagado no calendário externo",
  });
}

/** Corre o polling para um consultor, em todos os providers ligados. */
export async function pullAllForUser(
  supabaseAdmin: any,
  userId: string,
): Promise<Array<{ provider: CalendarProvider; applied: number; skipped: number; error: string | null }>> {
  const out: Array<{ provider: CalendarProvider; applied: number; skipped: number; error: string | null }> = [];
  for (const provider of CALENDAR_PROVIDERS) {
    const key = await getConnectionKeyForUser(supabaseAdmin, userId, provider);
    if (!key) continue;
    const r = await pullFromProvider(supabaseAdmin, userId, provider);
    out.push({ provider, applied: r.applied, skipped: r.skipped, error: r.error ?? null });
  }
  return out;
}

/** Ronda global do cron: todos os consultores com pelo menos um calendário ligado. */
export async function pullAllUsers(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("app_user_connections")
    .select("user_id, connector_id")
    .in("connector_id", CALENDAR_PROVIDERS);
  const rows = (data ?? []) as Array<{ user_id: string; connector_id: CalendarProvider }>;
  let applied = 0;
  for (const row of rows) {
    try {
      const r = await pullFromProvider(supabaseAdmin, row.user_id, row.connector_id);
      applied += r.applied;
    } catch (e) {
      console.error("[calendar-sync] pull falhou", row.connector_id, e);
    }
  }
  return { users: rows.length, applied };
}
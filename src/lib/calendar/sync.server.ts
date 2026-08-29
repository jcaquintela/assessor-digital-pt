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
import { initialEventCategory } from "@/lib/agenda/event-category";
import { lisbonHhMm } from "@/lib/assessor/lisbon-day";
import { getConnectionKeyForUser } from "./connections.server";
import { isCalendarAuthError } from "./auth-error";
import { isExternalEventMissing } from "./missing-event";
import {
  CALENDAR_PROVIDERS,
  GATEWAY_BASE_URL,
  type CalendarProvider,
} from "./providers";
import { isAgendaEvent } from "@/lib/agenda-kind";
import { outboundWindow } from "./event-body";
import { inVerifyPlan, type VerifyPlan } from "./verify-slice";
import { normalizeTitle, planDedupe, type ImportedRow } from "./dedupe";
import {
  isSeriesMaster,
  recurrenceType,
  seriesMasterId,
  type OutlookRecurrenceType,
} from "./outlook-recurrence";

const DEFAULT_DURATION_MIN = 60;
const TZ = "Europe/Lisbon";

export interface LocalEvent {
  id: string;
  title: string;
  notes: string | null;
  due_date: string; // instante ISO
  due_time: string | null;
  duration_minutes?: number | null;
  status: string | null;
  type: string | null;
  updated_at: string | null;
  archived_at?: string | null;
}

// Hora local de Lisboa: fonte única em lisbon-day.ts.


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
    .select("id, title, notes, due_date, due_time, duration_minutes, status, type, updated_at, archived_at")
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

// Contagem de chamadas à API por provider (para confirmar a quota real).
const apiCalls: Record<string, number> = {};
export function takeApiCallCounts(): Record<string, number> {
  const snapshot = { ...apiCalls };
  for (const k of Object.keys(apiCalls)) delete apiCalls[k];
  return snapshot;
}

export async function callProvider(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  path: string, init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: any; text: string }> {
  apiCalls[provider] = (apiCalls[provider] ?? 0) + 1;
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

/**
 * Duração real do evento externo, em minutos. Sem fim conhecido devolve null:
 * o consumidor volta ao valor por omissão em vez de inventar uma duração.
 */
export function externalDurationMinutes(
  ext: { startIso?: string | null; endIso?: string | null },
): number | null {
  if (!ext?.startIso || !ext?.endIso) return null;
  const start = new Date(ext.startIso).getTime();
  const end = new Date(ext.endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const mins = Math.round((end - start) / 60_000);
  if (mins <= 0 || mins > 24 * 60) return null;
  return mins;
}

export interface ExternalEvent {
  id: string;
  title: string | null;
  notes: string | null;
  startIso: string | null;
  /** Fim real do evento no calendário externo (quando o provedor o dá). */
  endIso?: string | null;
  updatedIso: string | null;
  cancelled: boolean;
  /** Outlook: tipo de recorrência do item devolvido pelo delta. */
  recurrenceType?: OutlookRecurrenceType | null;
  /** Outlook: série a que a ocorrência/excepção pertence. */
  seriesMasterId?: string | null;
}

const PROVIDER_PAGE_LIMIT = 50;
const VERIFY_LOOKBACK_DAYS = 1;
const VERIFY_LOOKAHEAD_DAYS = 370;
const VERIFY_PAGE_SIZE = 100;
const VERIFY_MAX_EVENTS = 500;

function appendQuery(path: string, params: Record<string, string | null | undefined>): string {
  const [base, rawQuery = ""] = path.split("?");
  const query = new URLSearchParams(rawQuery);
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return `${base}?${query.toString()}`;
}

function normalizeGoogle(item: any): ExternalEvent {
  const start = item?.start?.dateTime ?? (item?.start?.date ? `${item.start.date}T09:00:00Z` : null);
  const end = item?.end?.dateTime ?? null;
  return {
    endIso: end ? new Date(end).toISOString() : null,
    id: String(item?.id ?? ""),
    title: item?.summary ?? null,
    notes: item?.description ?? null,
    startIso: start ? new Date(start).toISOString() : null,
    updatedIso: item?.updated ? new Date(item.updated).toISOString() : null,
    cancelled: item?.status === "cancelled",
  };
}

export function normalizeOutlook(item: any): ExternalEvent {
  const raw = item?.start?.dateTime as string | undefined;
  const tz = item?.start?.timeZone as string | undefined;
  let startIso: string | null = null;
  if (raw) {
    const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}${tz === "UTC" || !tz ? "Z" : "Z"}`;
    const d = new Date(withZone);
    startIso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const rawEnd = item?.end?.dateTime as string | undefined;
  let endIso: string | null = null;
  if (rawEnd) {
    const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(rawEnd) ? rawEnd : `${rawEnd}Z`;
    const d = new Date(withZone);
    endIso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return {
    id: String(item?.id ?? ""),
    title: item?.subject ?? null,
    endIso,
    notes: item?.bodyPreview ?? null,
    startIso,
    updatedIso: item?.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).toISOString() : null,
    cancelled: !!item?.["@removed"] || item?.isCancelled === true,
    recurrenceType: recurrenceType(item),
    seriesMasterId: seriesMasterId(item),
  };
}

/**
 * Converte a página do delta do Outlook em eventos, ignorando o `seriesMaster`:
 * ele repetiria a 1ª ocorrência da série com outro id e criava um duplicado.
 * Ocorrências e excepções entram normalmente.
 */
export function outlookEventsFromDelta(items: any[]): ExternalEvent[] {
  return (items ?? []).filter((it) => !isSeriesMaster(it)).map((it) => normalizeOutlook(it));
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
    for (let page = 0; page < PROVIDER_PAGE_LIMIT; page++) {
      const r = await callProvider(supabaseAdmin, userId, provider, path);
      if (!r.ok) {
        // syncToken expirado (410) -> recomeçar sem token na próxima ronda.
        if (r.status === 410) await saveSyncState(supabaseAdmin, userId, provider, { sync_token: null });
        return { events: [], error: `${r.status}: ${r.text.slice(0, 200)}` };
      }
      for (const it of r.body?.items ?? []) events.push(normalizeGoogle(it));
      const nextPageToken = r.body?.nextPageToken ? String(r.body.nextPageToken) : null;
      if (!nextPageToken) return { events, nextToken: r.body?.nextSyncToken ?? state?.sync_token ?? null };
      path = appendQuery(path, { pageToken: nextPageToken });
    }
    return { events, error: "calendar_pagination_limit" };
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
  for (let page = 0; page < PROVIDER_PAGE_LIMIT; page++) {
    const r = await callProvider(supabaseAdmin, userId, provider, path, {
      headers: { Prefer: "odata.maxpagesize=200" },
    });
    if (!r.ok) {
      if (r.status === 410) await saveSyncState(supabaseAdmin, userId, provider, { delta_link: null });
      return { events: [], error: `${r.status}: ${r.text.slice(0, 200)}` };
    }
    for (const ev of outlookEventsFromDelta(r.body?.value ?? [])) events.push(ev);
    const nextLink = r.body?.["@odata.nextLink"] ? String(r.body["@odata.nextLink"]) : null;
    if (!nextLink) return { events, nextDelta: r.body?.["@odata.deltaLink"] ?? state?.delta_link ?? null };
    path = nextLink.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, "");
  }
  return { events, error: "calendar_pagination_limit" };
}

/**
 * Aplica no Afonso as alterações vindas do calendário externo.
 * Conflito: ganha o timestamp mais recente (last-write-wins).
 */
export async function pullFromProvider(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  opts?: { verify?: VerifyPlan | null | false },
): Promise<{ applied: number; skipped: number; error?: string }> {
  // `verify: false` -> só delta (ronda rápida). `null`/omitido -> verificação
  // completa. Um plano -> apenas a fatia desta ronda.
  const verify = opts?.verify ?? null;
  const connectionAPIKey = await getConnectionKeyForUser(supabaseAdmin, userId, provider);
  if (!connectionAPIKey) return { applied: 0, skipped: 0, error: "not_connected" };

  const { events, nextToken, nextDelta, error } = await fetchChanges(supabaseAdmin, userId, provider);
  if (error) {
    await saveSyncState(supabaseAdmin, userId, provider, { last_error: error });
    // Mesmo com o delta a falhar, confirmamos os eventos ligados: uma remoção
    // no calendário não pode ficar por detectar só porque o token caducou.
    const applied = verify === false
      ? 0
      : await verifyLinkedEvents(supabaseAdmin, userId, provider, verify);
    return { applied, skipped: 0, error };
  }

  const counts = await applyExternalEvents(supabaseAdmin, userId, provider, events);
  let applied = counts.applied;
  const skipped = counts.skipped;

  await saveSyncState(supabaseAdmin, userId, provider, {
    sync_token: nextToken ?? undefined,
    delta_link: nextDelta ?? undefined,
    last_error: null,
  });
  // Séries recorrentes do Outlook importadas antes da correção de recorrência
  // ficaram só com o master (1ª ocorrência, no passado) e nunca mais
  // apareceram no delta. Auto-cura: apaga o master e reimporta a janela.
  if (provider === "microsoft_outlook") {
    const { backfillOrphanSeries } = await import("./backfill-series.server");
    applied += (await backfillOrphanSeries(supabaseAdmin, userId)).repaired;
  }
  // Limpa pares duplicados que já estavam na agenda (importações repetidas).
  applied += await dedupeImportedEvents(supabaseAdmin, userId, provider);
  if (verify !== false) {
    applied += await verifyLinkedEvents(supabaseAdmin, userId, provider, verify);
  }
  return { applied, skipped };
}

/**
 * Aplica uma lista de eventos externos na agenda local (criar/actualizar/
 * cancelar). Partilhado pelo delta e pelo backfill por `calendarView`, para
 * que a protecção contra duplicados seja exactamente a mesma nos dois.
 */
export async function applyExternalEvents(
  supabaseAdmin: any, userId: string, provider: CalendarProvider, events: ExternalEvent[],
): Promise<{ applied: number; skipped: number }> {
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

    if (ext.cancelled) {
      if (link?.follow_up_id && !link.deleted) {
        await cancelLocalEvent(supabaseAdmin, userId, provider, link.follow_up_id, link.id, ext.id, ext.updatedIso);
        applied++;
      } else {
        skipped++;
      }
      continue;
    }

    // Eco da nossa própria escrita — nada a fazer. Cancelamentos vindos do
    // Google têm prioridade sobre este guard, porque por vezes chegam com o
    // mesmo `updated` que já tínhamos guardado na criação.
    if (link && ext.updatedIso && link.external_updated_at
        && new Date(ext.updatedIso).getTime() <= new Date(link.external_updated_at).getTime()) {
      skipped++;
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
        duration_minutes: externalDurationMinutes(ext),
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
    // Antes de inserir, procuramos um compromisso já importado deste mesmo
    // evento externo (ou um gémeo com o mesmo título e hora): evita o par
    // duplicado que aparecia como sobreposição na agenda.
    let followUpId = await findImportedTwin(supabaseAdmin, userId, provider, ext);
    if (!followUpId) {
      const { data: created } = await supabaseAdmin.from("follow_ups").insert({
        user_id: userId,
        title: ext.title,
        type: "evento",
        due_date: ext.startIso,
        due_time: lisbonHhMm(ext.startIso),
        duration_minutes: externalDurationMinutes(ext),
        status: "agendado",
        priority: "media",
        notes: ext.notes ?? null,
        timezone: TZ,
        source_channel: provider,
        external_reference: ext.id,
        created_by_assessor: false,
        // Agenda Inteligente: evento importado nasce já categorizado.
        event_category: initialEventCategory({ title: ext.title, type: "evento", notes: ext.notes ?? null }),
      }).select("id").single();
      followUpId = (created as { id: string } | null)?.id ?? null;
    }
    if (!followUpId) { skipped++; continue; }

    // Se reaproveitámos um gémeo e este evento é a ocorrência de uma série,
    // a referência externa passa a ser a ocorrência: é a entidade estável no
    // delta (o seriesMaster não volta a aparecer).
    if (isSeriesOccurrence(ext)) {
      await supabaseAdmin.from("follow_ups")
        .update({ external_reference: ext.id })
        .eq("id", followUpId).eq("user_id", userId);
    }

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
      series_master_id: ext.seriesMasterId ?? null,
      recurrence_type: ext.recurrenceType ?? null,
    }, { onConflict: "user_id,provider,follow_up_id" });
    await logSync(supabaseAdmin, {
      userId, provider, followUpId, externalEventId: ext.id,
      direction: "inbound", action: "create", origin: provider,
    });
    applied++;
  }

  return { applied, skipped };
}

/** Ocorrência (ou excepção) de uma série recorrente do Outlook. */
function isSeriesOccurrence(ext: ExternalEvent): boolean {
  return ext.recurrenceType === "occurrence" || ext.recurrenceType === "exception";
}

/**
 * Compromisso já importado que corresponde a este evento externo: primeiro por
 * referência externa, depois por título + hora (gémeo criado por uma ronda
 * anterior que não conseguiu registar a ligação).
 */
async function findImportedTwin(
  supabaseAdmin: any, userId: string, provider: CalendarProvider, ext: ExternalEvent,
): Promise<string | null> {
  const { data: byRef } = await supabaseAdmin
    .from("follow_ups")
    .select("id")
    .eq("user_id", userId)
    .eq("external_reference", ext.id)
    .is("archived_at", null)
    .limit(1);
  const ref = (byRef ?? []) as Array<{ id: string }>;
  if (ref[0]) return ref[0].id;

  if (!ext.startIso || !ext.title) return null;
  const start = new Date(ext.startIso).getTime();
  const { data: near } = await supabaseAdmin
    .from("follow_ups")
    .select("id, title, due_date, created_at, external_reference")
    .eq("user_id", userId)
    .eq("source_channel", provider)
    .is("archived_at", null)
    .gte("due_date", new Date(start - 60_000).toISOString())
    .lte("due_date", new Date(start + 60_000).toISOString())
    .limit(20);
  const wanted = normalizeTitle(ext.title);
  const twin = ((near ?? []) as ImportedRow[]).find((r) => normalizeTitle(r.title) === wanted);
  return twin?.id ?? null;
}

/**
 * Arquiva pares duplicados de eventos importados deste provedor (mesmo título
 * e mesma hora ao minuto). Nunca apaga nada no calendário externo: só deixa um
 * registo visível no Afonso.
 */
export async function dedupeImportedEvents(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("follow_ups")
    .select("id, title, due_date, created_at, external_reference, status")
    .eq("user_id", userId)
    .eq("source_channel", provider)
    .is("archived_at", null)
    .gte("due_date", since)
    .order("created_at", { ascending: true })
    .limit(500);
  const rows = ((data ?? []) as Array<ImportedRow & { status: string | null }>)
    .filter((r) => !["cancelado", "cancelada", "arquivado"].includes(String(r.status ?? "").toLowerCase()));
  if (rows.length < 2) return 0;

  const { data: links } = await supabaseAdmin
    .from("calendar_event_links")
    .select("follow_up_id, recurrence_type")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("deleted", false);
  const linkRows = (links ?? []) as Array<{ follow_up_id: string | null; recurrence_type?: string | null }>;
  const linked = new Set(linkRows.map((l) => l.follow_up_id).filter(Boolean));
  const occurrences = new Set(
    linkRows
      .filter((l) => l.recurrence_type === "occurrence" || l.recurrence_type === "exception")
      .map((l) => l.follow_up_id)
      .filter(Boolean),
  );

  const plans = planDedupe(
    rows.map((r) => ({ ...r, has_link: linked.has(r.id), is_occurrence: occurrences.has(r.id) })),
  );
  let removed = 0;
  for (const plan of plans) {
    for (const dup of plan.duplicates) {
      await supabaseAdmin.from("follow_ups")
        .update({ status: "cancelado", archived_at: new Date().toISOString() })
        .eq("id", dup.id).eq("user_id", userId);
      await supabaseAdmin.from("reminders")
        .update({ status: "cancelled" })
        .eq("user_id", userId)
        .eq("related_resource_type", "follow_up")
        .eq("related_resource_id", dup.id)
        .in("status", ["scheduled", "processing", "failed"]);
      await supabaseAdmin.from("calendar_event_links")
        .update({ deleted: true, last_synced_at: new Date().toISOString() })
        .eq("user_id", userId).eq("provider", provider).eq("follow_up_id", dup.id);
      await logSync(supabaseAdmin, {
        userId, provider, followUpId: dup.id, externalEventId: dup.external_reference,
        direction: "inbound", action: "dedupe", origin: provider,
        detail: `duplicado de ${plan.survivor.id}`,
      });
      removed++;
    }
  }
  return removed;
}



/**
 * Confirma, evento a evento, que os compromissos ligados ainda existem no
 * calendário externo. Cobre o caso em que o consultor apaga directamente no
 * Outlook/Google e o delta não nos traz a remoção.
 */
export async function verifyLinkedEvents(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  plan: VerifyPlan | null = null,
): Promise<number> {
  let cancelled = 0;
  const isGoogle = provider === "google_calendar";
  const since = new Date(Date.now() - VERIFY_LOOKBACK_DAYS * 86_400_000).toISOString();
  const until = new Date(Date.now() + VERIFY_LOOKAHEAD_DAYS * 86_400_000).toISOString();
  for (let offset = 0; offset < VERIFY_MAX_EVENTS; offset += VERIFY_PAGE_SIZE) {
    const { data } = await supabaseAdmin
      .from("calendar_event_links")
      .select("id, external_event_id, follow_up_id, follow_ups!inner(id, due_date, status, archived_at)")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("deleted", false)
      .gte("follow_ups.due_date", since)
      .lte("follow_ups.due_date", until)
      .order("created_at", { ascending: false })
      .range(offset, offset + VERIFY_PAGE_SIZE - 1);
    const links = (data ?? []) as any[];
    if (!links.length) break;
    for (const link of links) {
      const fu = link.follow_ups;
      if (!link.external_event_id || !link.follow_up_id) continue;
      if (fu?.archived_at || String(fu?.status ?? "").toLowerCase() === "cancelado") continue;
      // Rotação por fatias: nesta ronda só verificamos 1/N dos eventos.
      if (!inVerifyPlan(String(link.external_event_id), plan)) continue;
      const path = isGoogle
        ? `/calendar/v3/calendars/primary/events/${encodeURIComponent(link.external_event_id)}`
        : `/me/events/${encodeURIComponent(link.external_event_id)}`;
      const r = await callProvider(supabaseAdmin, userId, provider, path);
      if (!isExternalEventMissing(r.status, r.body, r.text)) continue;
      await cancelLocalEvent(supabaseAdmin, userId, provider, link.follow_up_id, link.id, link.external_event_id);
      cancelled++;
    }
    if (links.length < VERIFY_PAGE_SIZE) break;
  }
  return cancelled;
}

/** Cancela no Afonso um compromisso que desapareceu do calendário externo. */
async function cancelLocalEvent(
  supabaseAdmin: any, userId: string, provider: CalendarProvider,
  followUpId: string, linkId: string, externalEventId: string, externalUpdatedAt?: string | null,
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
    .update({ deleted: true, last_origin: provider, external_updated_at: externalUpdatedAt ?? null, last_synced_at: new Date().toISOString() })
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
export async function pullAllUsers(
  supabaseAdmin: any,
  opts?: { verify?: VerifyPlan | null | false },
) {
  const { data } = await supabaseAdmin
    .from("app_user_connections")
    .select("user_id, connector_id")
    .in("connector_id", CALENDAR_PROVIDERS);
  const rows = (data ?? []) as Array<{ user_id: string; connector_id: CalendarProvider }>;
  let applied = 0;
  for (const row of rows) {
    try {
      const r = await pullFromProvider(supabaseAdmin, row.user_id, row.connector_id, {
        verify: opts?.verify ?? false,
      });
      applied += r.applied;
    } catch (e) {
      console.error("[calendar-sync] pull falhou", row.connector_id, e);
    }
  }
  return { users: rows.length, applied };
}
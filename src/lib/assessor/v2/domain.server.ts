// Assessor v2 — Domain Services.
//
// Um executor por ferramenta declarada em `tools.ts`. Cada um:
//  - valida os argumentos com Zod (defesa em profundidade — o gateway
//    também valida, mas nunca confies em input externo);
//  - executa a operação idempotente na BD, respeitando RLS;
//  - devolve `{ ok, data?, error? }` — nunca lança.
//
// NÃO envia mensagens WhatsApp, não formata respostas em PT, não decide
// política conversacional. Isso é do orquestrador.

import { z } from "zod";
import {
  SearchPeopleArgs,
  CreatePersonArgs,
  SearchPropertiesArgs,
  CreatePropertyArgs,
  SearchAgendaArgs,
  CreateEventArgs,
  CreateFollowUpArgs,
  SaveInteractionArgs,
  SaveMiscellaneousArgs,
  CreateProspectingLeadArgs,
  SearchProspectingLeadsArgs,
  UpdateProspectingLeadArgs,
  RescheduleReminderArgs,
  SearchActiveRemindersArgs,
  CancelReminderArgs,
  SendReminderNowArgs,
  ZOD_BY_TOOL,
} from "./tools";
import { lisbonParts, addDaysYmd } from "../agenda";
import {
  upsertReminder,
  rescheduleReminder,
  cancelReminder,
  sendReminderNow,
  searchActiveReminders,
  isTimeInPast,
  nowLisbonYmd,
  nowLisbonHhMm,
} from "../v3/reminders.server";

// Converte uma data+hora locais em Europe/Lisbon para um ISO absoluto (UTC).
// Sem isto, `${date}T${time}:00` sem offset é interpretado pelo Postgres como
// UTC, fazendo com que "hoje às 12:10" fique guardado como 13:10 Lisbon
// (uma hora depois do que o consultor pediu).
function lisbonLocalToUtcIso(dateYmd: string, timeHm: string): string {
  const [hh, mm] = timeHm.split(":").map((n) => parseInt(n, 10));
  const [y, mo, d] = dateYmd.split("-").map((n) => parseInt(n, 10));
  const naiveUtc = Date.UTC(y, mo - 1, d, hh, mm, 0);
  // Descobre o offset de Lisbon nessa instância (minutos).
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(naiveUtc));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asLisbonUtc = Date.UTC(
    parseInt(m.year, 10), parseInt(m.month, 10) - 1, parseInt(m.day, 10),
    parseInt(m.hour === "24" ? "0" : m.hour, 10), parseInt(m.minute, 10), parseInt(m.second, 10),
  );
  const offsetMin = (asLisbonUtc - naiveUtc) / 60_000;
  return new Date(naiveUtc - offsetMin * 60_000).toISOString();
}

function agendaRange(period: "today" | "tomorrow" | "week" | "next_week"): { startIso: string; endIso: string; label: string } {
  const now = new Date();
  const { ymd, weekday } = lisbonParts(now);
  // segunda = 1 na convenção lisbonParts (0=domingo)
  const daysSinceMon = (weekday + 6) % 7;
  const monday = addDaysYmd(ymd, -daysSinceMon);
  const sunday = addDaysYmd(monday, 6);
  if (period === "today") return { startIso: ymd, endIso: ymd, label: "hoje" };
  if (period === "tomorrow") { const t = addDaysYmd(ymd, 1); return { startIso: t, endIso: t, label: "amanhã" }; }
  if (period === "week") return { startIso: monday, endIso: sunday, label: "esta semana" };
  const nm = addDaysYmd(monday, 7);
  return { startIso: nm, endIso: addDaysYmd(nm, 6), label: "próxima semana" };
}

export interface DomainContext {
  supabase: any;
  userId: string;
  channel: string;
  sourceMessageId?: string | null;
  // Quando presente, garante idempotência: `create_follow_up` e `create_event`
  // gravam-no em `follow_ups.source_pending_action_id` (índice único parcial)
  // e reutilizam o registo existente em vez de criar duplicados.
  pendingActionId?: string | null;
}

export interface DomainResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail(error: string): DomainResult { return { ok: false, error }; }
function ok<T>(data: T): DomainResult<T> { return { ok: true, data }; }

// Devolve o follow_up existente para esta pending_action, se houver.
async function findFollowUpByPending(
  ctx: DomainContext,
  pendingId: string,
): Promise<{ id: string; title: string; due_date: string; due_time: string | null } | null> {
  const { data } = await ctx.supabase
    .from("follow_ups")
    .select("id, title, due_date, due_time")
    .eq("user_id", ctx.userId)
    .eq("source_pending_action_id", pendingId)
    .maybeSingle();
  return (data as any) ?? null;
}

// Trata violação do índice único parcial como sucesso idempotente.
function isUniqueViolation(err: any): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const msg = String(err.message ?? "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique constraint");
}

function parse<T>(schema: z.ZodType<T>, args: unknown): { ok: true; value: T } | { ok: false; error: string } {
  const r = schema.safeParse(args);
  if (r.success) return { ok: true, value: r.data };
  const first = r.error.issues[0];
  return { ok: false, error: `${first?.path?.join(".") || "args"}: ${first?.message || "invalid"}` };
}

// ---------------------- executors ----------------------

async function execSearchPeople(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchPeopleArgs, args); if (!p.ok) return fail(p.error);
  const { query, relationship_type } = p.value;
  let q = ctx.supabase
    .from("people")
    .select("id, name, phone, email, relationship_type, summary")
    .eq("user_id", ctx.userId)
    .ilike("name", `%${query}%`)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (relationship_type) q = q.eq("relationship_type", relationship_type);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok({ results: data ?? [] });
}

async function execCreatePerson(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreatePersonArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const { data, error } = await ctx.supabase
    .from("people")
    .insert({
      user_id: ctx.userId,
      name: v.name.trim(),
      phone: v.phone ?? null,
      email: v.email ?? null,
      relationship_type: v.relationship_type,
      summary: v.summary ?? null,
    } as never)
    .select("id, name, relationship_type")
    .single();
  if (error) return fail(error.message);
  return ok({ person: data });
}

async function execSearchProperties(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchPropertiesArgs, args); if (!p.ok) return fail(p.error);
  const { query, status } = p.value;
  let q = ctx.supabase
    .from("properties")
    .select("id, title, typology, property_type, location, city, status, asking_price")
    .eq("user_id", ctx.userId)
    .or(`title.ilike.%${query}%,location.ilike.%${query}%,city.ilike.%${query}%,address.ilike.%${query}%`)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok({ results: data ?? [] });
}

async function execCreateProperty(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreatePropertyArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const { data, error } = await ctx.supabase
    .from("properties")
    .insert({
      user_id: ctx.userId,
      owner_person_id: v.owner_person_id ?? null,
      title: v.title.trim(),
      property_type: v.property_type ?? null,
      typology: v.typology ?? null,
      location: v.location ?? null,
      status: v.status ?? "em_angariacao",
      asking_price: v.asking_price ?? null,
      source_channel: ctx.channel,
      source_message_id: ctx.sourceMessageId ?? null,
    } as never)
    .select("id, title, status")
    .single();
  if (error) return fail(error.message);
  return ok({ property: data });
}

async function execSearchAgenda(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchAgendaArgs, args); if (!p.ok) return fail(p.error);
  const range = agendaRange(p.value.period);
  const { data, error } = await ctx.supabase
    .from("follow_ups")
    .select("id, title, type, due_date, due_time, priority, status, related_property_id, person_id")
    .eq("user_id", ctx.userId)
    .in("status", ["pendente", "em_progresso", "agendado"])
    .gte("due_date", range.startIso)
    .lte("due_date", range.endIso)
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) return fail(error.message);
  return ok({ range, items: data ?? [] });
}

async function execCreateEvent(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateEventArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const dueIsoDate = lisbonLocalToUtcIso(v.date, v.start_time);
  // Idempotência: um pending_action só pode criar um recurso.
  if (ctx.pendingActionId) {
    const existing = await findFollowUpByPending(ctx, ctx.pendingActionId);
    if (existing) return ok({ event: existing, reminderId: null, idempotent: true });
  }
  const { data, error } = await ctx.supabase
    .from("follow_ups")
    .insert({
      user_id: ctx.userId,
      title: v.title.trim(),
      type: v.event_type,
      due_date: dueIsoDate,
      due_time: v.start_time,
      status: "agendado",
      priority: "media",
      person_id: v.person_id ?? null,
      related_property_id: v.property_id ?? null,
      notes: v.notes ?? null,
      timezone: "Europe/Lisbon",
      source_channel: ctx.channel,
      source_message_id: ctx.sourceMessageId ?? null,
      created_by_assessor: true,
      source_pending_action_id: ctx.pendingActionId ?? null,
    } as never)
    .select("id, title, due_date, due_time")
    .single();
  if (error) {
    if (isUniqueViolation(error) && ctx.pendingActionId) {
      const existing = await findFollowUpByPending(ctx, ctx.pendingActionId);
      if (existing) return ok({ event: existing, reminderId: null, idempotent: true });
    }
    return fail(error.message);
  }

  let reminderId: string | null = null;
  if (v.reminder_minutes && v.reminder_minutes > 0) {
    const remindAt = new Date(new Date(dueIsoDate).getTime() - v.reminder_minutes * 60_000);
    const lisbonHm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon", hour12: false, hour: "2-digit", minute: "2-digit",
    }).format(remindAt);
    const { data: rem } = await ctx.supabase
      .from("follow_ups")
      .insert({
        user_id: ctx.userId,
        title: `Lembrete: ${v.title.trim()}`,
        type: "tarefa",
        due_date: remindAt.toISOString(),
        due_time: lisbonHm,
        status: "pendente",
        priority: "alta",
        person_id: v.person_id ?? null,
        related_property_id: v.property_id ?? null,
        timezone: "Europe/Lisbon",
        source_channel: ctx.channel,
        source_message_id: ctx.sourceMessageId ?? null,
        created_by_assessor: true,
      } as never)
      .select("id")
      .single();
    reminderId = (rem as { id: string } | null)?.id ?? null;
    // Registo canónico em `reminders` para o dispatcher robusto.
    if (reminderId) {
      await upsertReminder(ctx.supabase, {
        userId: ctx.userId,
        related_resource_type: "follow_up",
        related_resource_id: reminderId,
        scheduled_for: remindAt.toISOString(),
        message_preview: `Lembrete: ${v.title.trim()}`,
      });
    }
  }
  // Regista também um `reminder` para o próprio evento (à hora de início),
  // para o consultor ser avisado se pediu confirmação.
  if ((data as any)?.id) {
    await upsertReminder(ctx.supabase, {
      userId: ctx.userId,
      related_resource_type: "follow_up",
      related_resource_id: (data as any).id,
      scheduled_for: dueIsoDate,
      message_preview: `Lembrete: ${v.title.trim()} (${v.start_time}).`,
    });
  }
  return ok({ event: data, reminderId });
}

async function findActiveProspectingLead(ctx: DomainContext): Promise<{ id: string; title?: string | null; location?: string | null; phone?: string | null } | null> {
  const { data: state } = await ctx.supabase
    .from("conversation_states")
    .select("last_entity_type, last_entity_id")
    .eq("user_id", ctx.userId)
    .eq("channel", ctx.channel)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const entityType = (state as any)?.last_entity_type;
  const entityId = (state as any)?.last_entity_id;
  if (entityType !== "prospecting_lead" || !entityId) return null;

  const { data: lead } = await ctx.supabase
    .from("prospecting_leads" as never)
    .select("id, title, location, phone")
    .eq("id", entityId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return (lead as any) ?? null;
}

async function execCreateFollowUp(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateFollowUpArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const dueIsoDate = lisbonLocalToUtcIso(v.due_date, v.due_time ?? "09:00");
  // Idempotência: se já existe um follow_up para esta pending_action, devolve-o.
  if (ctx.pendingActionId) {
    const existing = await findFollowUpByPending(ctx, ctx.pendingActionId);
    if (existing) return ok({ follow_up: existing, idempotent: true });
  }
  const activeProspectingLead = (!v.person_id && !v.property_id)
    ? await findActiveProspectingLead(ctx)
    : null;
  const { data, error } = await ctx.supabase
    .from("follow_ups")
    .insert({
      user_id: ctx.userId,
      title: v.title.trim(),
      type: v.type,
      due_date: dueIsoDate,
      due_time: v.due_time ?? null,
      status: "pendente",
      priority: v.priority,
      person_id: v.person_id ?? null,
      related_property_id: v.property_id ?? null,
      related_prospecting_lead_id: activeProspectingLead?.id ?? null,
      notes: v.notes ?? null,
      timezone: "Europe/Lisbon",
      source_channel: ctx.channel,
      source_message_id: ctx.sourceMessageId ?? null,
      created_by_assessor: true,
      source_pending_action_id: ctx.pendingActionId ?? null,
    } as never)
    .select("id, title, due_date")
    .single();
  if (error) {
    if (isUniqueViolation(error) && ctx.pendingActionId) {
      const existing = await findFollowUpByPending(ctx, ctx.pendingActionId);
      if (existing) return ok({ follow_up: existing, idempotent: true });
    }
    return fail(error.message);
  }
  if (activeProspectingLead?.id) {
    await ctx.supabase
      .from("prospecting_leads" as never)
      .update({ next_follow_up_at: dueIsoDate } as never)
      .eq("id", activeProspectingLead.id)
      .eq("user_id", ctx.userId);
  }
  // Cria o lembrete canónico para o dispatcher.
  if ((data as any)?.id && v.due_time) {
    await upsertReminder(ctx.supabase, {
      userId: ctx.userId,
      related_resource_type: "follow_up",
      related_resource_id: (data as any).id,
      scheduled_for: dueIsoDate,
      message_preview: `Lembrete: ${v.title.trim()} (${v.due_time}).`,
    });
  }
  return ok({ follow_up: data });
}

async function execSaveInteraction(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SaveInteractionArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const { data, error } = await ctx.supabase
    .from("interactions")
    .insert({
      user_id: ctx.userId,
      person_id: v.person_id ?? null,
      source_channel: ctx.channel,
      summary: v.summary,
      interaction_type: v.interaction_type ?? "conversa",
      occurred_at: v.occurred_at ?? new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (error) return fail(error.message);
  return ok({ interaction: data });
}

async function execSaveMiscellaneous(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SaveMiscellaneousArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const { data, error } = await ctx.supabase
    .from("miscellaneous_items")
    .insert({
      user_id: ctx.userId,
      title: v.title,
      summary: v.summary ?? null,
      category: v.category ?? null,
      source_channel: ctx.channel,
      occurred_at: new Date().toISOString(),
      status: "aberto",
      tags: v.tags ?? [],
    } as never)
    .select("id, title")
    .single();
  if (error) return fail(error.message);
  return ok({ item: data });
}

// ---------- prospeção ----------

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  const nine = digits.length > 9 ? digits.slice(-9) : digits;
  return /^[239]\d{8}$/.test(nine) ? nine : null;
}

function buildLeadTitle(v: {
  title?: string | null;
  property_type?: string | null;
  typology?: string | null;
  address_hint?: string | null;
  location?: string | null;
}): string {
  if (v.title && v.title.trim()) return v.title.trim().slice(0, 200);
  const kind = (v.typology || v.property_type || "Placa").trim();
  const kindCap = kind.charAt(0).toUpperCase() + kind.slice(1);
  const near = v.address_hint ? ` ${v.address_hint.trim()}` : "";
  const loc = v.location ? ` — ${v.location.trim()}` : "";
  const t = `${kindCap}${near}${loc}`.trim();
  return (t || "Placa de prospeção").slice(0, 200);
}

async function execCreateProspectingLead(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateProspectingLeadArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const phone = normalizePhone(v.phone ?? null);

  // dedupe por telefone (não arquivadas)
  if (phone) {
    const { data: dup } = await ctx.supabase
      .from("prospecting_leads" as never)
      .select("id, title, location, status")
      .eq("user_id", ctx.userId)
      .eq("phone", phone)
      .neq("status", "archived")
      .limit(1)
      .maybeSingle();
    if (dup) return ok({ duplicate: true, existing: dup });
  }

  const title = buildLeadTitle(v);
  const notes = [v.notes ?? null, v.address_hint ? `Ref: ${v.address_hint}` : null]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 2000) || null;

  const row = {
    user_id: ctx.userId,
    title,
    phone,
    location: v.location?.trim() || null,
    address: v.address_hint?.trim() || null,
    source_type: v.source_type,
    listing_type: v.listing_type,
    agency_name: v.agency_name?.trim() || null,
    property_type: v.property_type?.trim() || null,
    typology: v.typology?.trim() || null,
    notes,
    source_channel: ctx.channel,
    source_message_id: ctx.sourceMessageId ?? null,
    status: "to_contact",
    extraction_raw: {},
  } as Record<string, unknown>;

  const { data, error } = await ctx.supabase
    .from("prospecting_leads" as never)
    .insert(row as never)
    .select("id, title, phone, location, status")
    .single();
  if (error) return fail(error.message);
  return ok({ duplicate: false, lead: data });
}

async function execSearchProspectingLeads(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchProspectingLeadsArgs, args); if (!p.ok) return fail(p.error);
  const { query, phone, location, status } = p.value;
  let q = ctx.supabase
    .from("prospecting_leads" as never)
    .select("id, title, phone, location, address, property_type, typology, status, listing_type, agency_name, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const normalized = normalizePhone(phone ?? null);
  if (normalized) q = q.eq("phone", normalized);
  if (location) q = q.ilike("location", `%${location}%`);
  if (status) q = q.eq("status", status);
  if (query && query.trim().length >= 2) {
    const term = `%${query.trim().replace(/[%_]/g, "")}%`;
    q = q.or(`title.ilike.${term},notes.ilike.${term},address.ilike.${term}`);
  }
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok({ results: data ?? [] });
}

async function execUpdateProspectingLead(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(UpdateProspectingLeadArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const patch: Record<string, unknown> = {};
  if (v.title !== undefined && v.title !== null) patch.title = v.title.trim().slice(0, 200);
  if (v.phone !== undefined) patch.phone = v.phone === null ? null : normalizePhone(v.phone);
  if (v.location !== undefined) patch.location = v.location?.trim() || null;
  if (v.address_hint !== undefined) patch.address = v.address_hint?.trim() || null;
  if (v.agency_name !== undefined) patch.agency_name = v.agency_name?.trim() || null;
  if (v.property_type !== undefined) patch.property_type = v.property_type?.trim() || null;
  if (v.typology !== undefined) patch.typology = v.typology?.trim() || null;
  if (v.listing_type) patch.listing_type = v.listing_type;
  if (v.source_type) patch.source_type = v.source_type;
  if (v.status) patch.status = v.status;
  if (v.notes !== undefined) patch.notes = v.notes?.slice(0, 2000) ?? null;

  if (!Object.keys(patch).length) return fail("nada_para_actualizar");

  const { data, error } = await ctx.supabase
    .from("prospecting_leads" as never)
    .update(patch as never)
    .eq("id", v.id)
    .eq("user_id", ctx.userId)
    .select("id, title, status")
    .single();
  if (error) return fail(error.message);
  return ok({ lead: data });
}

// ---------------------- registo público ----------------------

export type ToolExecutor = (ctx: DomainContext, args: unknown) => Promise<DomainResult>;

// ---------- Executores de lembretes ----------

async function execRescheduleReminder(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(RescheduleReminderArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  if (isTimeInPast(v.new_date, v.new_time)) {
    return ok({ ok: false, past: true, requested_date: v.new_date, requested_time: v.new_time });
  }
  const r = await rescheduleReminder(ctx.supabase, {
    userId: ctx.userId,
    channel: ctx.channel,
    reminder_id: v.reminder_id ?? null,
    related_resource_type: (v.related_resource_type as any) ?? null,
    related_resource_id: v.related_resource_id ?? null,
    subject_hint: v.subject_hint ?? null,
    new_date: v.new_date,
    new_time: v.new_time,
    timezone: v.timezone ?? "Europe/Lisbon",
    reason: v.reason ?? undefined,
  });
  if (!r.ok && r.candidates) return ok({ ambiguous: true, candidates: r.candidates });
  if (!r.ok) return fail(r.error ?? "reschedule_failed");
  return ok({ reminder: r.reminder });
}

async function execSearchActiveReminders(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchActiveRemindersArgs, args); if (!p.ok) return fail(p.error);
  const rows = await searchActiveReminders(ctx.supabase, {
    userId: ctx.userId,
    query: p.value.query ?? null,
    related_resource_type: (p.value.related_resource_type as any) ?? null,
    related_resource_id: p.value.related_resource_id ?? null,
  });
  return ok({ results: rows });
}

async function execCancelReminder(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CancelReminderArgs, args); if (!p.ok) return fail(p.error);
  const r = await cancelReminder(ctx.supabase, ctx.userId, p.value.reminder_id);
  if (!r.ok) return fail(r.error ?? "cancel_failed");
  return ok({ cancelled: true });
}

async function execSendReminderNow(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SendReminderNowArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  let reminderId = v.reminder_id ?? null;
  if (!reminderId && v.subject_hint) {
    const rows = await searchActiveReminders(ctx.supabase, {
      userId: ctx.userId,
      query: v.subject_hint,
    });
    if (rows.length === 1) reminderId = rows[0].id;
    else if (rows.length > 1) {
      return ok({
        ambiguous: true,
        candidates: rows.map((r) => ({
          reminder_id: r.id, title: r.title, scheduled_for: r.scheduled_for,
        })),
      });
    }
  }
  if (!reminderId) return fail("reminder_not_found");
  const r = await sendReminderNow(ctx.supabase, {
    userId: ctx.userId,
    reminder_id: reminderId,
    overrideText: v.override_text ?? null,
  });
  if (!r.ok) return fail(r.error ?? "send_failed");
  return ok({ sent: true, external_message_id: r.external_message_id ?? null });
}

export const TOOL_REGISTRY: Record<string, ToolExecutor> = {
  search_people: execSearchPeople,
  create_person: execCreatePerson,
  search_properties: execSearchProperties,
  create_property: execCreateProperty,
  search_agenda: execSearchAgenda,
  create_event: execCreateEvent,
  create_follow_up: execCreateFollowUp,
  save_interaction: execSaveInteraction,
  save_miscellaneous: execSaveMiscellaneous,
  create_prospecting_lead: execCreateProspectingLead,
  search_prospecting_leads: execSearchProspectingLeads,
  update_prospecting_lead: execUpdateProspectingLead,
  reschedule_reminder: execRescheduleReminder,
  search_active_reminders: execSearchActiveReminders,
  cancel_reminder: execCancelReminder,
  send_reminder_now: execSendReminderNow,
};

export async function dispatchToolCall(
  ctx: DomainContext,
  name: string,
  rawArgs: string,
): Promise<DomainResult> {
  const exec = TOOL_REGISTRY[name];
  if (!exec) return fail(`unknown_tool:${name}`);
  let args: unknown;
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; }
  catch { return fail("invalid_json_args"); }
  const schema = ZOD_BY_TOOL[name];
  if (schema && !schema.safeParse(args).success) {
    // let the executor produce a precise message
  }
  try {
    return await exec(ctx, args);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

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
  ZOD_BY_TOOL,
} from "./tools";
import { lisbonParts, addDaysYmd } from "../agenda";

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
}

export interface DomainResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

function fail(error: string): DomainResult { return { ok: false, error }; }
function ok<T>(data: T): DomainResult<T> { return { ok: true, data }; }

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
  const dueIsoDate = `${v.date}T${v.start_time}:00`;
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
    } as never)
    .select("id, title, due_date, due_time")
    .single();
  if (error) return fail(error.message);

  let reminderId: string | null = null;
  if (v.reminder_minutes && v.reminder_minutes > 0) {
    const remindAt = new Date(new Date(dueIsoDate).getTime() - v.reminder_minutes * 60_000);
    const { data: rem } = await ctx.supabase
      .from("follow_ups")
      .insert({
        user_id: ctx.userId,
        title: `Lembrete: ${v.title.trim()}`,
        type: "tarefa",
        due_date: remindAt.toISOString(),
        due_time: `${String(remindAt.getUTCHours()).padStart(2, "0")}:${String(remindAt.getUTCMinutes()).padStart(2, "0")}`,
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
  }
  return ok({ event: data, reminderId });
}

async function execCreateFollowUp(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateFollowUpArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const dueIsoDate = v.due_time ? `${v.due_date}T${v.due_time}:00` : `${v.due_date}T09:00:00`;
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
      notes: v.notes ?? null,
      timezone: "Europe/Lisbon",
      source_channel: ctx.channel,
      source_message_id: ctx.sourceMessageId ?? null,
      created_by_assessor: true,
    } as never)
    .select("id, title, due_date")
    .single();
  if (error) return fail(error.message);
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

// ---------------------- registo público ----------------------

export type ToolExecutor = (ctx: DomainContext, args: unknown) => Promise<DomainResult>;

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

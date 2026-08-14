import { TELEMETRY_EVENTS, trackEvent, hoursBetween } from "@/lib/telemetry/events";
import { sanitizeMiscFields } from "../misc-text";
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
import { isAgendaEvent } from "@/lib/agenda-kind";
import { initialEventClass } from "../event-class";
import {
  compareTokenMatches, filterByRelevance, foldLike, foldText, searchTokens, weightedTokenMatchScore,
} from "@/lib/search/normalize";
import { ensureTitle } from "../titles";
import {
  SearchPeopleArgs,
  CreatePersonArgs,
  SearchPropertiesArgs,
  CreatePropertyArgs,
  SearchAgendaArgs,
  CreateEventArgs,
  CreateFollowUpArgs,
  CreateRoutineArgs,
  SetRoutineActiveArgs,
  SaveInteractionArgs,
  SaveMiscellaneousArgs,
  CreateFinancialMovementArgs,
  CreateDealArgs,
  SearchDealsArgs,
  CreateProspectingLeadArgs,
  SearchProspectingLeadsArgs,
  UpdateProspectingLeadArgs,
  UpdatePersonArgs,
  UpdatePropertyArgs,
  ArchiveRecordArgs,
  RescheduleReminderArgs,
  SearchActiveRemindersArgs,
  CancelReminderArgs,
  CancelFollowUpArgs,
  CompleteFollowUpArgs,
  SendReminderNowArgs,
  ListUncategorizedPropertiesArgs,
  SetPropertyCategoryArgs,
  ZOD_BY_TOOL,
} from "./tools";
import { lisbonParts, addDaysYmd } from "../agenda";
import {
  findRescheduleCandidate,
  type ExistingEventLite,
  type RescheduleCandidate,
} from "../event-subject";
import { CANCELLED_STATUS, CANCELLED_OUTCOME, matchByHint } from "../v3/cancel-agenda";
import {
  classifyPeopleMatches, isConfidentNameMatch, personNameFromEventText,
} from "@/lib/people/name-match";
import { COMPLETED_STATUS, COMPLETED_OUTCOME } from "../v3/completion-intent";
import { pushEventToProviders } from "@/lib/calendar/sync.server";
import { stopFollowUpTriggers } from "@/lib/calendar/stop-triggers.server";
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
  // Salta a pergunta "isto actualiza o compromisso que já tinhas?" — usado
  // quando o consultor já respondeu que é um compromisso diferente.
  skipDuplicateCheck?: boolean;
  // O consultor já decidiu (nesta conversa) que o seguimento fica sem pessoa
  // associada, ou já respondeu à pergunta de ligação.
  skipPersonResolution?: boolean;
  // Candidatos rejeitados nesta conversa — nunca voltam a ser propostos.
  rejectedPersonIds?: string[];
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

// Normalização barata para comparar títulos ("Ligar ao Paulo!" ==
// "ligar ao paulo"). Retira pontuação, acentos e artigos ligeiros.
function normalizeTitleKey(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(o|a|os|as|ao|à|de|do|da|para|pra)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Procura um follow_up aberto com o mesmo assunto (mesma pessoa/imóvel
// quando aplicável). Usado para reagendar em vez de duplicar.
async function findOpenFollowUpByTitle(
  ctx: DomainContext,
  args: { title: string; person_id: string | null; property_id: string | null },
): Promise<{ id: string; title: string } | null> {
  const key = normalizeTitleKey(args.title);
  if (!key) return null;
  let q = ctx.supabase
    .from("follow_ups")
    .select("id, title, person_id, related_property_id, status, created_at")
    .eq("user_id", ctx.userId)
    .in("status", ["pendente", "agendado"])
    .order("created_at", { ascending: false })
    .limit(25);
  if (args.person_id) q = q.eq("person_id", args.person_id);
  if (args.property_id) q = q.eq("related_property_id", args.property_id);
  const { data } = await q;
  const rows = ((data as any[]) ?? []).filter((r) => normalizeTitleKey(r.title) === key);
  return rows[0] ?? null;
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

// Termos para o `or(...)`: o pedaço tal e qual e, em palavras longas, o
// prefixo sem a última letra (apanha gralhas no fim, como "canelaz").
function tokenOrTerms(column: string, tokens: string[]): string {
  const terms = new Set<string>();
  for (const t of tokens) {
    terms.add(`${column}.ilike.%${t}%`);
    if (t.length >= 6) terms.add(`${column}.ilike.%${t.slice(0, -1)}%`);
  }
  return [...terms].join(",");
}

async function execSearchPeople(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchPeopleArgs, args); if (!p.ok) return fail(p.error);
  const { query, relationship_type } = p.value;
  let q = ctx.supabase
    .from("people")
    .select("id, name, phone, email, relationship_type, summary")
    .eq("user_id", ctx.userId)
    .ilike("name_norm", `%${foldLike(query)}%`)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (relationship_type) q = q.eq("relationship_type", relationship_type);
  const { data, error } = await q;
  if (error) return fail(error.message);
  if (data && data.length) return await withNameConfidence(ctx, query, data as Record<string, unknown>[]);

  // "sergio can" ou "canelas serg": a frase inteira não casa, mas cada pedaço
  // casa numa palavra do nome. Segunda tentativa por palavras, ordenada pelo
  // número de pedaços encontrados.
  const tokens = searchTokens(query);
  if (!tokens.length) return ok({ results: [] });
  let q2 = ctx.supabase
    .from("people")
    .select("id, name, phone, email, relationship_type, summary")
    .eq("user_id", ctx.userId)
    .or(tokenOrTerms("name_norm", tokens))
    .limit(30);
  if (relationship_type) q2 = q2.eq("relationship_type", relationship_type);
  const { data: rows, error: e2 } = await q2;
  if (e2) return fail(e2.message);
  const scoredPeople = ((rows ?? []) as Record<string, unknown>[])
    .map((r) => {
      const m = weightedTokenMatchScore([{ text: r.name as string, weight: 1 }], tokens);
      return { score: m.hits, spread: m.spread, row: r };
    })
    .filter((x) => x.score > 0);
  const scored = filterByRelevance(scoredPeople)
    .sort((a, b) => compareTokenMatches({ hits: a.score, spread: a.spread }, { hits: b.score, spread: b.spread }))
    .slice(0, 8)
    .map((x) => x.row);
  return await withNameConfidence(ctx, query, scored);
}

/**
 * "Manuel" não é "Manuela". Separamos o que casa numa palavra inteira do que
 * é apenas parecido: só o primeiro grupo sai como resultado; o resto vai como
 * sugestão explícita. Quando não há ninguém, ainda procuramos um compromisso
 * agendado com esse nome que ficou sem contacto ligado — é isso que o
 * consultor está mesmo a tentar encontrar.
 */
async function withNameConfidence(
  ctx: DomainContext,
  query: string,
  rows: Record<string, unknown>[],
): Promise<DomainResult> {
  const { exact, suggestions } = classifyPeopleMatches(query, rows as Array<{ name?: string | null }>);
  if (exact.length) return ok({ results: exact, query });
  const unlinked = await findUnlinkedEventForName(ctx, query);
  return ok({
    // Os parecidos continuam disponíveis para o motor (pesquisa parcial
    // "serg" é legítima), mas nunca são apresentados como se fossem a
    // pessoa pedida — quem escreve a resposta usa `no_exact_match`.
    results: rows,
    suggestions,
    no_exact_match: true,
    query,
    unlinked_event: unlinked,
  });
}

/** Compromisso aberto cujo título fala desta pessoa mas sem `person_id`. */
export async function findUnlinkedEventForName(
  ctx: DomainContext,
  name: string,
): Promise<{ id: string; title: string; due_date: string | null; due_time: string | null } | null> {
  const term = foldLike(name);
  if (term.length < 3) return null;
  const { data } = await ctx.supabase
    .from("follow_ups")
    .select("id, title, due_date, due_time, person_id")
    .eq("user_id", ctx.userId)
    .in("status", ["pendente", "em_progresso", "agendado"])
    .is("person_id", null)
    .ilike("title", `%${term}%`)
    .order("due_date", { ascending: true })
    .limit(5);
  const rows = ((data as any[]) ?? []).filter((r) => isConfidentNameMatch(String(r?.title ?? ""), name));
  const hit = rows[0];
  return hit ? { id: hit.id, title: hit.title, due_date: hit.due_date ?? null, due_time: hit.due_time ?? null } : null;
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
  return execSearchPropertiesInner(ctx, args);
}

// Lista o Drive Inteligente. Sem query devolve os ficheiros mais recentes e o
// total real, para a resposta poder oferecer "a lista toda".
async function execSearchFiles(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const a = (args ?? {}) as { query?: string | null; document_type?: string | null };
  const query = String(a.query ?? "").trim();
  let q = ctx.supabase
    .from("uploaded_files")
    .select("id, original_file_name, document_type, classification, ai_summary, mime_type, created_at", {
      count: "exact",
    })
    .eq("user_id", ctx.userId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (query) {
    q = q.or(
      `search_norm.ilike.%${foldLike(query)}%`,
    );
  }
  if (a.document_type) q = q.eq("document_type", a.document_type);
  const { data, error, count } = await q;
  if (error) return fail(error.message);
  const results = (data ?? []) as Record<string, unknown>[];
  if (!query || results.length) {
    return ok({ results, total: typeof count === "number" ? count : results.length });
  }

  // "caderneta sao bras" ou "cad predial": a frase inteira não casa, mas cada
  // pedaço casa numa palavra do nome do ficheiro, resumo ou morada.
  const tokens = searchTokens(query);
  if (!tokens.length) return ok({ results: [], total: 0 });
  let q2 = ctx.supabase
    .from("uploaded_files")
    .select("id, original_file_name, document_type, classification, ai_summary, mime_type, created_at, doc_morada")
    .eq("user_id", ctx.userId)
    .is("deleted_at", null)
    .is("archived_at", null)
    .or(tokenOrTerms("search_norm", tokens))
    .order("created_at", { ascending: false })
    .limit(50);
  if (a.document_type) q2 = q2.eq("document_type", a.document_type);
  const { data: rows, error: e2 } = await q2;
  if (e2) return fail(e2.message);
  // Nome do ficheiro manda; tipo de documento ajuda; resumo e morada pesam menos.
  const scoredFiles = ((rows ?? []) as Record<string, unknown>[])
    .map((r) => {
      const m = weightedTokenMatchScore(
        [
          { text: r.original_file_name as string, weight: 1 },
          { text: r.document_type as string, weight: 0.7 },
          { text: r.ai_summary as string, weight: 0.5 },
          { text: r.doc_morada as string, weight: 0.4 },
        ],
        tokens,
      );
      const { doc_morada: _m, ...rest } = r;
      return { score: m.hits, spread: m.spread, row: rest };
    })
    .filter((x) => x.score > 0);
  const scored = filterByRelevance(scoredFiles)
    .sort((a2, b2) =>
      compareTokenMatches({ hits: a2.score, spread: a2.spread }, { hits: b2.score, spread: b2.spread }))
    .slice(0, 20)
    .map((x) => x.row);
  return ok({ results: scored, total: scored.length });
}

async function execSearchPropertiesInner(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchPropertiesArgs, args); if (!p.ok) return fail(p.error);
  const { query, status } = p.value;
  let q = ctx.supabase
    .from("properties")
    .select("id, title, typology, property_type, location, city, status, asking_price")
    .eq("user_id", ctx.userId)
    .ilike("search_norm", `%${foldLike(query)}%`)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return fail(error.message);
  if (data && data.length) return ok({ results: data });

  // O consultor diz "Rua do Sol Matosinhos" mas o título é "Moradia V3 na Rua
  // do Sol, Matosinhos": a frase inteira nunca casa. Segunda tentativa por
  // palavras, ordenada pelo número de palavras encontradas.
  const tokens = searchTokens(query);
  if (!tokens.length) return ok({ results: [] });
  let q2 = ctx.supabase
    .from("properties")
    .select("id, title, typology, property_type, location, city, address, status, asking_price")
    .eq("user_id", ctx.userId)
    .or(tokenOrTerms("search_norm", tokens))
    .limit(30);
  if (status) q2 = q2.eq("status", status);
  const { data: rows, error: e2 } = await q2;
  if (e2) return fail(e2.message);
  type Scored = { score: number; spread: number; row: Record<string, unknown> };
  const scoredProps: Scored[] = ((rows ?? []) as Record<string, unknown>[])
    .map((r: Record<string, unknown>) => {
      // O título é o que o consultor reconhece; morada e zona valem menos.
      const m = weightedTokenMatchScore(
        [
          { text: r.title as string, weight: 1 },
          { text: r.city as string, weight: 0.6 },
          { text: r.location as string, weight: 0.6 },
          { text: r.address as string, weight: 0.5 },
        ],
        tokens,
      );
      const { address: _a, ...rest } = r;
      return { score: m.hits, spread: m.spread, row: rest } as Scored;
    })
    .filter((x: Scored) => x.score > 0);
  const scored: Record<string, unknown>[] = filterByRelevance(scoredProps)
    .sort((a: Scored, b: Scored) =>
      compareTokenMatches({ hits: a.score, spread: a.spread }, { hits: b.score, spread: b.spread }))
    .slice(0, 8)
    .map((x: Scored) => x.row);
  return ok({ results: scored });
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

// ---- Categorias de imóveis ------------------------------------------------
// Mesmo mecanismo das categorias do Drive: nome + cor, por consultor.
// O assessor propõe, o consultor confirma; nunca reclassifica sozinho.

async function execListPropertyCategories(ctx: DomainContext): Promise<DomainResult> {
  const { data, error } = await (ctx.supabase.from("property_categories") as any)
    .select("id, name, color")
    .eq("user_id", ctx.userId)
    .order("name");
  if (error) return fail(error.message);
  return ok({ categories: data ?? [] });
}

async function execListUncategorizedProperties(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(ListUncategorizedPropertiesArgs, args); if (!p.ok) return fail(p.error);
  const limit = p.value.limit ?? 25;
  const { data, error } = await (ctx.supabase.from("properties") as any)
    .select("id, title, property_type, typology, location, city, address, status, source_channel, notes")
    .eq("user_id", ctx.userId)
    .is("category_id", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return fail(error.message);
  return ok({ properties: data ?? [] });
}

async function execSetPropertyCategory(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SetPropertyCategoryArgs, args); if (!p.ok) return fail(p.error);
  const name = (p.value.category_name ?? "").trim();

  let propertyId = p.value.property_id ?? null;
  if (!propertyId && p.value.property_query) {
    propertyId = await resolvePropertyFromText(ctx, p.value.property_query);
  }
  if (!propertyId) return fail("property_not_found");

  let categoryId: string | null = null;
  if (name) {
    const { data: existing } = await (ctx.supabase.from("property_categories") as any)
      .select("id, name")
      .eq("user_id", ctx.userId)
      .ilike("name", name)
      .maybeSingle();
    if (existing) categoryId = existing.id as string;
    else {
      const { data: created, error: cErr } = await (ctx.supabase.from("property_categories") as any)
        .insert({ user_id: ctx.userId, name })
        .select("id")
        .single();
      if (cErr) return fail(cErr.message);
      categoryId = created.id as string;
    }
  }

  const { data, error } = await (ctx.supabase.from("properties") as any)
    .update({ category_id: categoryId })
    .eq("id", propertyId)
    .eq("user_id", ctx.userId)
    .select("id, title")
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("property_not_found");
  return ok({ property: data, category: name || null });
}

async function execSearchAgenda(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchAgendaArgs, args); if (!p.ok) return fail(p.error);
  const range = agendaRange(p.value.period);
  // `due_date` é timestamptz. Comparar com "YYYY-MM-DD" faz o Postgres ler
  // meia-noite, pelo que um compromisso das 09:30 de hoje ficava FORA do
  // `lte`. Usamos o intervalo real do dia em Lisboa [00:00, dia+1 00:00).
  const fromIso = lisbonLocalToUtcIso(range.startIso, "00:00");
  const toIso = lisbonLocalToUtcIso(addDaysYmd(range.endIso, 1), "00:00");
  const { data, error } = await ctx.supabase
    .from("follow_ups")
    .select("id, title, type, due_date, due_time, priority, status, related_property_id, person_id")
    .eq("user_id", ctx.userId)
    .in("status", ["pendente", "em_progresso", "agendado"])
    .gte("due_date", fromIso)
    .lt("due_date", toIso)
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) return fail(error.message);
  return ok({ range, items: data ?? [] });
}

async function execCreateEvent(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  return execCreateEventInner(ctx, args);
}

/** Normaliza texto para comparação difusa (sem acentos, minúsculas). */
function normalizeForMatch(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Tenta descobrir de que imóvel se fala quando o motor não devolveu o id.
 * Compara o texto do compromisso com o título/morada/cidade dos imóveis do
 * consultor. Só liga quando há uma única correspondência clara.
 */
export async function resolvePropertyFromText(ctx: DomainContext, text: string): Promise<string | null> {
  let source = text || "";
  // O título gravado pode perder a morada ("Visita com Sr. Almeida"); nesse
  // caso, olhamos para a frase original do consultor.
  if (ctx.sourceMessageId) {
    const { data: msg } = await ctx.supabase
      .from("assessor_messages")
      .select("content")
      .eq("id", ctx.sourceMessageId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const extra = (msg as { content?: string } | null)?.content;
    if (extra) source = `${source} ${extra}`;
  }
  const hay = normalizeForMatch(source);
  if (hay.length < 6) return null;
  const { data } = await ctx.supabase
    .from("properties")
    .select("id, title, address, location, city")
    .eq("user_id", ctx.userId)
    .limit(300);
  const rows = (data ?? []) as Array<{ id: string; title: string | null; address: string | null; location: string | null; city: string | null }>;
  const matches = new Set<string>();
  for (const r of rows) {
    for (const raw of [r.address, r.title, r.location]) {
      const needle = normalizeForMatch(String(raw ?? ""));
      if (needle.length >= 6 && hay.includes(needle)) { matches.add(r.id); break; }
    }
  }
  return matches.size === 1 ? [...matches][0]! : null;
}

/**
 * Procura na BD um compromisso aberto do mesmo assunto no mesmo dia (ou no
 * dia seguinte) com hora diferente. Ver `event-subject.ts`.
 */

export interface ResolvedPerson {
  personId: string | null;
  name: string | null;
  suggestions: Array<{ id: string; name: string }>;
}

/**
 * Descobre de que pessoa se fala num compromisso quando o motor não devolveu
 * o id. Só liga quando há uma correspondência de palavra inteira e única;
 * caso contrário devolve o nome (e os parecidos) para o motor perguntar.
 */
export async function resolvePersonFromText(ctx: DomainContext, text: string): Promise<ResolvedPerson> {
  const name = personNameFromEventText(text);
  if (!name) return { personId: null, name: null, suggestions: [] };
  const { data } = await ctx.supabase
    .from("people")
    .select("id, name")
    .eq("user_id", ctx.userId)
    .limit(500);
  const rows = ((data as any[]) ?? []) as Array<{ id: string; name: string }>;
  const { exact, suggestions } = classifyPeopleMatches(name, rows);
  if (exact.length === 1) return { personId: exact[0]!.id, name, suggestions: [] };
  if (exact.length > 1) {
    return { personId: null, name, suggestions: exact.slice(0, 3).map((r) => ({ id: r.id, name: r.name })) };
  }
  return { personId: null, name, suggestions: suggestions.slice(0, 3).map((r) => ({ id: r.id, name: r.name })) };
}

async function findRescheduleCandidateInDb(
  ctx: DomainContext,
  incoming: { title: string; date: string; time: string },
): Promise<RescheduleCandidate | null> {
  const from = lisbonLocalToUtcIso(addDaysYmd(incoming.date, -1), "00:00");
  const to = lisbonLocalToUtcIso(addDaysYmd(incoming.date, 2), "00:00");
  const { data } = await ctx.supabase
    .from("follow_ups")
    .select("id, title, due_date, due_time")
    .eq("user_id", ctx.userId)
    .in("status", ["pendente", "agendado"])
    .gte("due_date", from)
    .lt("due_date", to)
    .limit(50);
  return findRescheduleCandidate(((data as any[]) ?? []) as ExistingEventLite[], incoming);
}

async function execCreateEventInner(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateEventArgs, args); if (!p.ok) return fail(p.error);
  // Última linha de defesa: a string "null" nunca pode chegar à BD.
  const v = { ...p.value, title: ensureTitle(p.value.title, "Compromisso") };
  // O imóvel é muitas vezes falado ("visita à Alameda da República") sem que o
  // motor devolva o id. Sem ligação, a visita não aparece na ficha do imóvel.
  if (!v.property_id) {
    v.property_id = await resolvePropertyFromText(ctx, [v.title, v.notes].filter(Boolean).join(" "));
  }
  // Um compromisso "com o Manuel" nunca pode ficar só como texto. Ou ligamos
  // ao contacto certo, ou perguntamos — nunca inventamos nem deixamos solto.
  if (!v.person_id) {
    const resolved = await resolvePersonFromText(ctx, [v.title, v.notes].filter(Boolean).join(" "));
    if (resolved.personId) v.person_id = resolved.personId;
    else if (resolved.name) {
      return ok({
        needsPersonConfirmation: true,
        personName: resolved.name,
        suggestions: resolved.suggestions,
        incoming: { ...v, date: v.date, time: v.start_time },
      });
    }
  }
  const dueIsoDate = lisbonLocalToUtcIso(v.date, v.start_time);
  // Idempotência: um pending_action só pode criar um recurso.
  if (ctx.pendingActionId) {
    const existing = await findFollowUpByPending(ctx, ctx.pendingActionId);
    if (existing) return ok({ event: existing, reminderId: null, idempotent: true });
  }
  // Anti-duplicação por assunto: o mesmo compromisso pode chegar duas vezes
  // (o motor executa e ainda assim pergunta "marco?", e o "Sim" volta a
  // executar). Se já existe um evento aberto com o mesmo título e a mesma
  // pessoa/imóvel, devolvemo-lo — reagendando se a hora mudou.
  const existingOpen = await findOpenFollowUpByTitle(ctx, {
    title: v.title,
    person_id: v.person_id ?? null,
    property_id: v.property_id ?? null,
  });
  if (existingOpen) {
    const { data: current } = await ctx.supabase
      .from("follow_ups")
      .select("id, title, type, due_date, due_time")
      .eq("id", existingOpen.id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const sameSlot = (current as any)?.due_date
      && new Date((current as any).due_date).getTime() === new Date(dueIsoDate).getTime();
    // O registo existente pode ter sido gravado como seguimento (tipo
    // errado) — nesse caso não aparece na agenda nem no calendário.
    // Promovemo-lo a compromisso em vez de dizer só "já estava registado".
    const typeCorrected = !isAgendaEvent((current as any)?.type, (current as any)?.due_time);
    if (!sameSlot || typeCorrected) {
      await ctx.supabase
        .from("follow_ups")
        .update({
          due_date: dueIsoDate,
          due_time: v.start_time,
          status: "agendado",
          ...(typeCorrected ? { type: v.event_type } : {}),
        } as never)
        .eq("id", existingOpen.id)
        .eq("user_id", ctx.userId);
    }
    if (!sameSlot) {
      try {
        await rescheduleReminder(ctx.supabase, {
          userId: ctx.userId,
          channel: ctx.channel,
          related_resource_type: "follow_up",
          related_resource_id: existingOpen.id,
          new_date: v.date,
          new_time: v.start_time,
          timezone: "Europe/Lisbon",
        });
      } catch { /* noop */ }
    }
    // Espelha a alteração nos calendários ligados (nunca bloqueia).
    await pushEventToProviders({
      userId: ctx.userId, followUpId: existingOpen.id, action: "upsert",
    });
    return ok({
      event: { id: existingOpen.id, title: v.title, due_date: dueIsoDate, due_time: v.start_time },
      reminderId: null,
      idempotent: true,
      rescheduled: !sameSlot,
      typeCorrected,
    });
  }
  // Mesmo assunto, título diferente ("Consulta endocrinologista" vs "consulta
  // com a endocrinologista"): pode ser a MESMA consulta com hora nova. Nunca
  // assumimos — devolvemos a dúvida para o motor perguntar.
  if (!ctx.skipDuplicateCheck) {
    const candidate = await findRescheduleCandidateInDb(ctx, {
      title: v.title, date: v.date, time: v.start_time,
    });
    if (candidate) {
      return ok({
        needsRescheduleConfirmation: true,
        candidate,
        incoming: { ...v, date: v.date, time: v.start_time },
      });
    }
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
      // Reunião interna nasce já marcada como interna: nunca pede "Como
      // correu?" nem entra nas superfícies de atenção do dashboard.
      event_class: initialEventClass({
        title: v.title,
        person_id: v.person_id ?? null,
        related_property_id: v.property_id ?? null,
      }),
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
    const { reminderInstantFor } = await import("@/lib/assessor/reminders/lead-time.server");
    const when = await reminderInstantFor(ctx.supabase, ctx.userId, dueIsoDate);
    await upsertReminder(ctx.supabase, {
      userId: ctx.userId,
      related_resource_type: "follow_up",
      related_resource_id: (data as any).id,
      scheduled_for: when,
      message_preview: `Lembrete: ${v.title.trim()} (${v.start_time}).`,
    });
  }
  if ((data as any)?.id) {
    await pushEventToProviders({
      userId: ctx.userId, followUpId: (data as any).id, action: "upsert",
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
  const v = { ...p.value, title: ensureTitle(p.value.title, "Lembrete") };
  if (!v.property_id) {
    v.property_id = await resolvePropertyFromText(ctx, [v.title, (v as any).notes].filter(Boolean).join(" "));
  }
  // Resolução obrigatória de pessoa ANTES de escrever: um seguimento falado
  // "com o Manuel" nunca pode ficar com o nome preso em texto livre e
  // `person_id: null` por omissão. Ou liga com certeza, ou pergunta.
  let personDeliberatelyUnlinked = false;
  if (!v.person_id && !ctx.skipPersonResolution) {
    const { resolvePersonForWrite, recentlyRejectedPersonIds } =
      await import("@/lib/people/resolve-person.server");
    const text = [v.title, (v as any).notes].filter(Boolean).join(" ");
    const excludeIds = ctx.rejectedPersonIds?.length
      ? ctx.rejectedPersonIds
      : await recentlyRejectedPersonIds(ctx);
    const res = await resolvePersonForWrite(ctx, text, { excludeIds });
    if (res.status === "linked" && res.personId) {
      v.person_id = res.personId;
    } else if (res.status !== "none") {
      return ok({
        needsPersonConfirmation: true,
        mode: res.status,
        personName: res.name,
        suggestions: res.candidates,
        candidateIds: res.candidates.map((c) => c.id),
        incoming: { ...v },
      });
    }
  } else if (!v.person_id && ctx.skipPersonResolution) {
    personDeliberatelyUnlinked = true;
  }
  const dueIsoDate = lisbonLocalToUtcIso(v.due_date, v.due_time ?? "09:00");
  // Idempotência: se já existe um follow_up para esta pending_action, devolve-o.
  if (ctx.pendingActionId) {
    const existing = await findFollowUpByPending(ctx, ctx.pendingActionId);
    if (existing) return ok({ follow_up: existing, idempotent: true });
  }
  // Anti-duplicação por assunto (só quando não há pendingActionId — nesse
  // caso a idempotência forte já é feita pelo índice único parcial).
  // Se já existir um seguimento aberto com o mesmo título normalizado e
  // mesma pessoa/imóvel, reagendamo-lo em vez de criar um novo.
  const existingOpen = ctx.pendingActionId
    ? null
    : await findOpenFollowUpByTitle(ctx, {
        title: v.title,
        person_id: v.person_id ?? null,
        property_id: v.property_id ?? null,
      });
  if (existingOpen) {
    await ctx.supabase
      .from("follow_ups")
      .update({
        due_date: dueIsoDate,
        due_time: v.due_time ?? null,
        status: "pendente",
        priority: v.priority,
      } as never)
      .eq("id", existingOpen.id)
      .eq("user_id", ctx.userId);
    if (v.due_time) {
      try {
        await rescheduleReminder(ctx.supabase, {
          userId: ctx.userId,
          channel: ctx.channel,
          related_resource_type: "follow_up",
          related_resource_id: existingOpen.id,
          new_date: v.due_date,
          new_time: v.due_time,
          timezone: "Europe/Lisbon",
        });
      } catch { /* noop */ }
    }
    return ok({
      follow_up: { id: existingOpen.id, title: v.title, due_date: dueIsoDate },
      idempotent: true,
      rescheduled: true,
    });
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
      notes: personDeliberatelyUnlinked
        ? (await import("@/lib/people/resolve-person.server")).withNoPersonNote(v.notes)
        : (v.notes ?? null),
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
    const { reminderInstantFor } = await import("@/lib/assessor/reminders/lead-time.server");
    const when = await reminderInstantFor(ctx.supabase, ctx.userId, dueIsoDate);
    await upsertReminder(ctx.supabase, {
      userId: ctx.userId,
      related_resource_type: "follow_up",
      related_resource_id: (data as any).id,
      scheduled_for: when,
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
      is_confidential: v.is_confidential === true,
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
    .insert(sanitizeMiscFields({
      user_id: ctx.userId,
      title: v.title,
      summary: v.summary ?? null,
      category: v.category ?? null,
      source_channel: ctx.channel,
      occurred_at: new Date().toISOString(),
      status: "inbox",
      tags: v.tags ?? [],
    }) as never)
    .select("id, title")
    .single();
  if (error) return fail(error.message);
  return ok({ item: data });
}

function todayLisbonYmd(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const part of parts) m[part.type] = part.value;
  return `${m.year}-${m.month}-${m.day}`;
}


// Normaliza a referência textual do negócio para comparação de duplicados
// ("Comissão do terreno · valor..." → "comissao do terreno valor...").
function normalizeDedupeRef(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

async function execCreateFinancialMovement(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateFinancialMovementArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  let opportunityId = v.opportunity_id ?? null;

  // Dedupe: mesmo tipo, mesmo valor, mesmo dia E mesmo negócio/imóvel —
  // devolve o existente em vez de criar um segundo registo. Incluir o
  // negócio/imóvel evita bloquear duas comissões reais e distintas do mesmo
  // valor no mesmo dia (dois negócios fechados por coincidência iguais).
  const dedupeDate = v.movement_date ?? todayLisbonYmd();
  {
    const dayStart = `${String(dedupeDate).slice(0, 10)}T00:00:00.000Z`;
    const dayEnd = `${String(dedupeDate).slice(0, 10)}T23:59:59.999Z`;
    let dupQuery = ctx.supabase
      .from("financial_movements")
      .select("id, type, amount, description, status, movement_date, opportunity_id, property_id")
      .eq("user_id", ctx.userId)
      .eq("type", v.type)
      .eq("amount", v.amount)
      .gte("movement_date", dayStart)
      .lte("movement_date", dayEnd);

    // Âmbito: se o pedido já traz negócio ou imóvel, o duplicado tem de ser
    // do MESMO negócio/imóvel. Sem negócio nem imóvel, comparamos também a
    // referência textual (descrição) para distinguir negócios diferentes.
    if (v.opportunity_id) dupQuery = dupQuery.eq("opportunity_id", v.opportunity_id);
    else if (v.property_id) dupQuery = dupQuery.eq("property_id", v.property_id);

    const { data: dupRows } = await dupQuery.limit(20);
    const candidates = ((dupRows as any[]) ?? []);
    const sameScope = (row: any): boolean => {
      if (v.opportunity_id) return row.opportunity_id === v.opportunity_id;
      if (v.property_id) return row.property_id === v.property_id;
      // Sem âmbito explícito: só é duplicado se falar do mesmo negócio.
      const ref = normalizeDedupeRef(v.property_reference ?? v.opportunity_title ?? v.description);
      const rowRef = normalizeDedupeRef(row.description);
      if (!ref || !rowRef) return true;
      return rowRef.includes(ref) || ref.includes(rowRef);
    };
    const dup = candidates.find(sameScope);
    if (dup) return ok({ duplicate: true, existing: dup });
  }

  // Um imóvel nunca cria negócio sozinho: registar uma comissão liga-se a um
  // negócio JÁ existente do mesmo imóvel, mas nunca inventa um negócio novo.
  // Criar negócio é decisão explícita do consultor (ficha do imóvel / negócios).
  if (!opportunityId && v.property_id) {
    const { data: linked } = await ctx.supabase
      .from("opportunity_properties")
      .select("opportunity_id")
      .eq("user_id", ctx.userId)
      .eq("property_id", v.property_id)
      .limit(1)
      .maybeSingle();
    opportunityId = (linked as any)?.opportunity_id ?? null;
    if (!opportunityId) {
      const { data: legacy } = await ctx.supabase
        .from("opportunities")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("property_id", v.property_id)
        .limit(1)
        .maybeSingle();
      opportunityId = (legacy as any)?.id ?? null;
    }
  }

  const movementDate = dedupeDate;
  const { data, error } = await ctx.supabase
    .from("financial_movements")
    .insert({
      user_id: ctx.userId,
      opportunity_id: opportunityId,
      property_id: v.property_id ?? null,
      type: v.type,
      description: v.description.trim(),
      category: v.category ?? (v.type === "commission" ? "Comissão" : null),
      amount: v.amount,
      vat_amount: v.vat_amount ?? null,
      status: v.status ?? (v.type === "expense" ? "Recebida" : "Prevista"),
      movement_date: movementDate,
    } as never)
    .select("id, type, amount, status, opportunity_id, vat_amount")
    .single();
  if (error) return fail(`financial_movements:${error.message}`);
  return ok({ duplicate: false, movement: data, opportunity_id: opportunityId });
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
    .select("id, title, phone, location, status, listing_type, property_type, typology")
    .single();
  if (error) return fail(error.message);
  await trackEvent(ctx.supabase, {
    userId: ctx.userId,
    event: TELEMETRY_EVENTS.leadRegistado,
    leadId: (data as any)?.id ?? null,
    channel: ctx.channel,
    properties: { origem: "assessor" },
  });
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
  if (location) q = q.ilike("search_norm", `%${foldLike(location)}%`);
  if (status) q = q.eq("status", status);
  if (query && query.trim().length >= 2) {
    const term = `%${foldLike(query)}%`;
    q = q.or(`search_norm.ilike.${term},notes.ilike.${term}`);
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

  let before: any = null;
  if (patch.status === "contacted") {
    const { data: cur } = await ctx.supabase
      .from("prospecting_leads" as never)
      .select("status, created_at")
      .eq("id", v.id).eq("user_id", ctx.userId).maybeSingle();
    before = cur;
  }
  const { data, error } = await ctx.supabase
    .from("prospecting_leads" as never)
    .update(patch as never)
    .eq("id", v.id)
    .eq("user_id", ctx.userId)
    .select("id, title, status")
    .single();
  if (error) return fail(error.message);
  // Guardrail: só a confirmação explícita do consultor conta como contacto.
  if (before && before.status !== "contacted") {
    await trackEvent(ctx.supabase, {
      userId: ctx.userId,
      event: TELEMETRY_EVENTS.leadContactado,
      leadId: v.id,
      channel: ctx.channel,
      properties: { horas_desde_registo: hoursBetween(before.created_at), origem: "assessor" },
    });
  }
  return ok({ lead: data });
}

// ---------- Editar com recibo e arquivar (nunca apagar) ----------

/** Campos como o consultor lhes chama — o recibo tem de ser legível. */
const FIELD_LABELS: Record<string, string> = {
  name: "nome", phone: "telefone", email: "email",
  relationship_type: "relação", notes: "notas",
  title: "título", address: "morada", typology: "tipologia",
  asking_price: "preço", status: "estado",
};

function buildReceipt(before: Record<string, unknown> | null, patch: Record<string, unknown>) {
  return Object.keys(patch).map((k) => ({
    campo: FIELD_LABELS[k] ?? k,
    antes: before?.[k] ?? null,
    depois: patch[k],
  }));
}

async function execUpdatePerson(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(UpdatePersonArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const patch: Record<string, unknown> = {};
  if (v.name !== undefined && v.name !== null && v.name.trim()) patch.name = v.name.trim().slice(0, 200);
  if (v.phone !== undefined) patch.phone = v.phone === null ? null : normalizePhone(v.phone);
  if (v.email !== undefined) patch.email = v.email?.trim() || null;
  if (v.relationship_type !== undefined && v.relationship_type) patch.relationship_type = v.relationship_type;
  if (v.notes !== undefined) patch.notes = v.notes?.slice(0, 2000) ?? null;
  if (!Object.keys(patch).length) return fail("nada_para_actualizar");

  const { data: before } = await ctx.supabase
    .from("people" as never)
    .select("name, phone, email, relationship_type, notes")
    .eq("id", v.id).eq("user_id", ctx.userId).maybeSingle();
  if (!before) return fail("pessoa_nao_encontrada");

  const { data, error } = await ctx.supabase
    .from("people" as never)
    .update(patch as never)
    .eq("id", v.id).eq("user_id", ctx.userId)
    .select("id, name")
    .single();
  if (error) return fail(error.message);
  return ok({ person: data, recibo: buildReceipt(before as Record<string, unknown>, patch) });
}

async function execUpdateProperty(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(UpdatePropertyArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const patch: Record<string, unknown> = {};
  if (v.title !== undefined && v.title !== null && v.title.trim()) patch.title = v.title.trim().slice(0, 200);
  if (v.address !== undefined) patch.address = v.address?.trim() || null;
  if (v.typology !== undefined) patch.typology = v.typology?.trim() || null;
  if (v.asking_price !== undefined) patch.asking_price = v.asking_price ?? null;
  if (v.status !== undefined && v.status) patch.status = v.status;
  if (v.notes !== undefined) patch.notes = v.notes?.slice(0, 2000) ?? null;
  if (!Object.keys(patch).length) return fail("nada_para_actualizar");

  const { data: before } = await ctx.supabase
    .from("properties" as never)
    .select("title, address, typology, asking_price, status, notes")
    .eq("id", v.id).eq("user_id", ctx.userId).maybeSingle();
  if (!before) return fail("imovel_nao_encontrado");

  const { data, error } = await ctx.supabase
    .from("properties" as never)
    .update(patch as never)
    .eq("id", v.id).eq("user_id", ctx.userId)
    .select("id, title")
    .single();
  if (error) return fail(error.message);
  return ok({ property: data, recibo: buildReceipt(before as Record<string, unknown>, patch) });
}

const ARCHIVE_TABLES: Record<string, string> = {
  person: "people",
  property: "properties",
  deal: "opportunities",
  follow_up: "follow_ups",
  movement: "financial_movements",
  interaction: "interactions",
};

/**
 * Por conversa nunca se apaga: arquiva-se. O registo sai das listas de
 * trabalho, continua na ficha e o consultor pode repor quando quiser.
 */
async function execArchiveRecord(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(ArchiveRecordArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  const table = ARCHIVE_TABLES[v.entity];
  if (!table) return fail("entidade_desconhecida");
  const undo = v.undo === true;
  const patch: Record<string, unknown> = { archived_at: undo ? null : new Date().toISOString() };
  if (v.entity === "property") patch.status = undo ? "por_angariar" : "arquivado";

  const { data, error } = await ctx.supabase
    .from(table as never)
    .update(patch as never)
    .eq("id", v.id).eq("user_id", ctx.userId)
    .select("id")
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("registo_nao_encontrado");
  // Arquivar um compromisso tem de o tirar também do calendário ligado e
  // travar os avisos já agendados — senão continua a lembrar do lado externo.
  if (v.entity === "follow_up") {
    if (undo) {
      await pushEventToProviders({ userId: ctx.userId, followUpId: v.id, action: "upsert" });
    } else {
      await stopFollowUpTriggers(ctx.supabase, ctx.userId, [v.id]);
    }
  }
  return ok({ entity: v.entity, id: v.id, arquivado: !undo, reversivel: true });
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
  if (r.cancelled > 0) return ok({ cancelled: true, count: r.cancelled });
  // O id pode ser de um compromisso e não de um aviso: em vez de mentir
  // "Feito.", tenta desmarcar mesmo o seguimento correspondente.
  const viaFollowUp = await cancelFollowUpsByIds(ctx, [p.value.reminder_id], null);
  if (viaFollowUp.length) {
    return ok({ cancelled: true, count: viaFollowUp.length, items: viaFollowUp });
  }
  return fail("nada_para_cancelar");
}

// ---------- Desmarcar compromissos/seguimentos ----------

const OPEN_FOLLOW_UP_STATUSES = ["agendado", "pendente", "Agendado", "Pendente", "em curso"];

async function cancelFollowUpsByIds(
  ctx: DomainContext,
  ids: string[],
  reason: string | null,
): Promise<Array<{ id: string; title: string | null; due_time: string | null }>> {
  if (!ids.length) return [];
  const { data } = await ctx.supabase
    .from("follow_ups")
    .update({
      status: CANCELLED_STATUS,
      outcome: CANCELLED_OUTCOME,
      ...(reason ? { outcome_notes: reason } : {}),
    } as never)
    .eq("user_id", ctx.userId)
    .in("id", ids)
    .neq("status", CANCELLED_STATUS)
    .select("id, title, due_time");
  const items = Array.isArray(data) ? (data as any[]) : [];
  // Desmarcar é desmarcar em todo o lado: avisos internos e evento no
  // Google/Outlook.
  await stopFollowUpTriggers(ctx.supabase, ctx.userId, items.map((i) => i.id));
  return items;
}

async function listOpenFollowUps(
  ctx: DomainContext,
  range: { startIso: string; endIso: string } | null,
): Promise<Array<{ id: string; title: string | null; due_date: string; due_time: string | null }>> {
  let q = ctx.supabase
    .from("follow_ups")
    .select("id, title, due_date, due_time, status")
    .eq("user_id", ctx.userId)
    .in("status", OPEN_FOLLOW_UP_STATUSES);
  // `due_date` é timestamptz: comparar com "YYYY-MM-DD" lê meia-noite e deixa
  // de fora tudo o que tem hora. Usamos o intervalo real do dia em Lisboa.
  if (range) {
    q = q
      .gte("due_date", lisbonLocalToUtcIso(range.startIso, "00:00"))
      .lt("due_date", lisbonLocalToUtcIso(addDaysYmd(range.endIso, 1), "00:00"));
  }
  const { data } = await q.order("due_date", { ascending: true }).limit(100);
  return Array.isArray(data) ? (data as any[]) : [];
}

/**
 * "Limpa a agenda de hoje" / "desmarca tudo" / "cancela a visita ao Sr.
 * Duarte". Escreve mesmo em `follow_ups` (status Arquivado + resultado
 * cancelado) e devolve a lista do que foi desmarcado, para a resposta nunca
 * poder afirmar mais do que aconteceu.
 */
async function execCancelFollowUp(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CancelFollowUpArgs, args); if (!p.ok) return fail(p.error);
  const a = p.value;
  const reason = a.reason ?? null;

  if (a.follow_up_ids?.length) {
    const items = await cancelFollowUpsByIds(ctx, a.follow_up_ids, reason);
    return ok({ cancelled: items.length, items, period_label: null });
  }

  const period = a.period ?? (a.all_in_period ? "today" : null);
  const range = period ? agendaRange(period) : null;
  const open = await listOpenFollowUps(ctx, range);

  // Pista de assunto: restringe. Sem pista, só o período manda (e só quando o
  // pedido foi explicitamente "tudo").
  let targets = open;
  if (a.subject_hint) {
    targets = matchByHint(open, a.subject_hint);
    if (!targets.length) return ok({ cancelled: 0, items: [], period_label: range?.label ?? null });
    if (targets.length > 1 && !a.all_in_period) {
      return ok({ ambiguous: true, candidates: targets.slice(0, 5), cancelled: 0, items: [] });
    }
  } else if (!a.all_in_period && !period) {
    return fail("indicar_o_que_cancelar");
  }

  const items = await cancelFollowUpsByIds(ctx, targets.map((t) => t.id), reason);
  return ok({ cancelled: items.length, items, period_label: range?.label ?? null });
}

async function execSendReminderNow(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  return execSendReminderNowInner(ctx, args);
}

/**
 * "O estudo de mercado já está tratado." Fecha mesmo o seguimento (estado
 * Concluído + resultado concluído), pára os avisos ligados e diz se o
 * assunto tem uma rotina activa a repetir — fechar hoje não decide o futuro.
 */
async function execCompleteFollowUp(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CompleteFollowUpArgs, args); if (!p.ok) return fail(p.error);
  const a = p.value;

  let ids = a.follow_up_ids ?? [];
  if (!ids.length) {
    if (!a.subject_hint) return fail("indicar_o_que_concluir");
    const open = await listOpenFollowUps(ctx, null);
    const targets = matchByHint(open, a.subject_hint);
    if (!targets.length) return ok({ completed: 0, items: [], subject_hint: a.subject_hint });
    if (targets.length > 1) {
      return ok({ ambiguous: true, candidates: targets.slice(0, 5), completed: 0, items: [] });
    }
    ids = targets.map((t) => t.id);
  }

  const { data } = await ctx.supabase
    .from("follow_ups")
    .update({
      status: COMPLETED_STATUS,
      outcome: COMPLETED_OUTCOME,
      outcome_recorded_at: new Date().toISOString(),
      ...(a.notes ? { outcome_notes: a.notes } : {}),
    } as never)
    .eq("user_id", ctx.userId)
    .in("id", ids)
    .select("id, title, due_time");
  const items = Array.isArray(data) ? (data as any[]) : [];
  // Concluído é concluído: nenhum aviso interno nem evento externo pode
  // voltar a disparar por causa deste seguimento.
  if (items.length) {
    await stopFollowUpTriggers(ctx.supabase, ctx.userId, items.map((i) => i.id));
  }

  // Recorrência genuína: não desligamos nada por nossa conta — devolvemos a
  // rotina para o motor perguntar ao consultor.
  let recurring: { id: string; title: string } | null = null;
  try {
    const { data: routines } = await ctx.supabase
      .from("routines")
      .select("id, title, active")
      .eq("user_id", ctx.userId)
      .eq("active", true)
      .limit(50);
    const hint = a.subject_hint ?? items[0]?.title ?? "";
    const hit = hint ? matchByHint((routines as any[]) ?? [], hint)[0] : null;
    if (hit) recurring = { id: String(hit.id), title: String(hit.title ?? "") };
  } catch { /* noop */ }

  return ok({ completed: items.length, items, recurring });
}

/**
 * Liga/desliga uma rotina — só a pedido explícito do consultor (resposta à
 * pergunta de recorrência). O Afonso nunca decide isto por si.
 */
async function execSetRoutineActive(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SetRoutineActiveArgs, args); if (!p.ok) return fail(p.error);
  const { routine_id, active } = p.value;
  const { data, error } = await ctx.supabase
    .from("routines")
    .update({ active } as never)
    .eq("user_id", ctx.userId)
    .eq("id", routine_id)
    .select("id, title, active");
  if (error) return fail(String((error as any)?.message ?? "erro_ao_gravar"));
  const row = (Array.isArray(data) ? (data as any[])[0] : null) ?? null;
  if (!row) return fail("rotina_nao_encontrada");
  return ok({ routine: row });
}

async function execSendReminderNowInner(ctx: DomainContext, args: unknown): Promise<DomainResult> {
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

// ---------- rotinas (lembretes recorrentes) ----------

const PRIORITY_PT: Record<string, "Alta" | "Média" | "Baixa"> = {
  alta: "Alta", media: "Média", "média": "Média", baixa: "Baixa",
};

// Próxima ocorrência (em UTC ISO) estritamente depois de agora, calculada
// sobre a hora local de Lisboa.
function nextRoutineRunIso(v: {
  frequency: "daily" | "weekly" | "monthly";
  time_of_day: string;
  interval_n?: number | null;
  weekday?: number | null;
  day_of_month?: number | null;
}): string {
  const step = Math.max(1, v.interval_n ?? 1);
  const todayYmd = nowLisbonYmd();
  const nowHm = nowLisbonHhMm();
  const [y, m, d] = todayYmd.split("-").map((n) => parseInt(n, 10));

  const ymd = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

  if (v.frequency === "weekly") {
    const base = new Date(Date.UTC(y, m - 1, d));
    const target = v.weekday ?? base.getUTCDay();
    let diff = (target - base.getUTCDay() + 7) % 7;
    if (diff === 0 && v.time_of_day <= nowHm) diff = 7 * step;
    base.setUTCDate(base.getUTCDate() + diff);
    return lisbonLocalToUtcIso(ymd(base), v.time_of_day);
  }

  if (v.frequency === "monthly") {
    const dom = v.day_of_month ?? d;
    const clamp = (yy: number, mm: number) =>
      Math.min(dom, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate());
    let yy = y, mm = m - 1;
    let day = clamp(yy, mm);
    if (day < d || (day === d && v.time_of_day <= nowHm)) {
      mm += step;
      yy += Math.floor(mm / 12);
      mm = ((mm % 12) + 12) % 12;
      day = clamp(yy, mm);
    }
    return lisbonLocalToUtcIso(
      `${yy}-${String(mm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      v.time_of_day,
    );
  }

  // daily
  const base = new Date(Date.UTC(y, m - 1, d));
  if (v.time_of_day <= nowHm) base.setUTCDate(base.getUTCDate() + step);
  return lisbonLocalToUtcIso(ymd(base), v.time_of_day);
}

async function execCreateRoutine(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateRoutineArgs, args); if (!p.ok) return fail(p.error);
  const v = { ...p.value, title: ensureTitle(p.value.title, "Lembrete") };

  // Anti-duplicação: mesma rotina (título + hora + frequência) já activa.
  const { data: existing } = await ctx.supabase
    .from("routines")
    .select("id, title, time_of_day, frequency, next_run_at")
    .eq("user_id", ctx.userId)
    .eq("active", true)
    .eq("frequency", v.frequency)
    .eq("time_of_day", v.time_of_day)
    .ilike("title", v.title.trim())
    .limit(1);
  const dup = ((existing as any[]) ?? [])[0];
  if (dup) return ok({ routine: dup, idempotent: true });

  const nextRunIso = nextRoutineRunIso(v);
  const { data, error } = await ctx.supabase
    .from("routines")
    .insert({
      user_id: ctx.userId,
      title: v.title.trim(),
      notes: v.notes ?? null,
      frequency: v.frequency,
      interval_n: Math.max(1, v.interval_n ?? 1),
      weekday: v.frequency === "weekly" ? (v.weekday ?? null) : null,
      day_of_month: v.frequency === "monthly" ? (v.day_of_month ?? null) : null,
      time_of_day: v.time_of_day,
      next_run_at: nextRunIso,
      priority: PRIORITY_PT[String(v.priority ?? "media").toLowerCase()] ?? "Média",
      person_id: v.person_id ?? null,
      active: true,
    } as never)
    .select("id, title, frequency, time_of_day, next_run_at")
    .maybeSingle();
  if (error) return fail(error.message);
  return ok({ routine: data });
}


// ---------- Negócio (deal) ----------

async function execSearchDeals(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(SearchDealsArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  let q = ctx.supabase
    .from("opportunities")
    .select("id, title, stage, deal_kind, type, value, person_id, property_id, archived_at")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (v.person_id) q = q.eq("person_id", v.person_id);
  if (v.property_id) q = q.eq("property_id", v.property_id);
  if (v.query) q = q.ilike("title_norm", `%${foldLike(v.query)}%`);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok({ deals: data ?? [] });
}

async function execCreateDeal(ctx: DomainContext, args: unknown): Promise<DomainResult> {
  const p = parse(CreateDealArgs, args); if (!p.ok) return fail(p.error);
  const v = p.value;
  try {
    const { createDealCore } = await import("@/lib/deals/create.server");
    // O imóvel pode ainda só existir nas palavras do consultor. Depois do
    // "sim", ou reaproveitamos o registo que corresponde à descrição, ou
    // criamos a ficha para o negócio ter mesmo um imóvel.
    let propertyId = v.property_id ?? null;
    if (!propertyId && v.property_hint) {
      const { extractPropertyHint } = await import("@/lib/deals/property-hint");
      const hint = extractPropertyHint(v.property_hint);
      if (hint) {
        const { findPropertyByHint, createPropertyFromHint } = await import("@/lib/deals/property-hint.server");
        const found = await findPropertyByHint(ctx.supabase, ctx.userId, hint);
        const prop = found ?? await createPropertyFromHint(ctx.supabase, ctx.userId, hint, v.value ?? null);
        propertyId = prop.id;
      }
    }
    const res = await createDealCore(ctx.supabase, ctx.userId, {
      title: v.title,
      kind: v.kind ?? null,
      stage: v.stage ?? null,
      personId: v.person_id ?? null,
      propertyId,
      value: v.value ?? 0,
      notes: v.notes ?? null,
      source: "assessor",
      linkMovementIds: v.link_movement_ids ?? null,
    });
    return ok(res);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export const TOOL_REGISTRY: Record<string, ToolExecutor> = {
  // Lembrete recorrente ("todos os dias às 9:45"). Guarda uma rotina e
  // materializa o primeiro seguimento na próxima ocorrência.
  search_people: execSearchPeople,
  create_routine: execCreateRoutine,
  list_property_categories: execListPropertyCategories,
  list_uncategorized_properties: execListUncategorizedProperties,
  set_property_category: execSetPropertyCategory,
  create_person: execCreatePerson,
  search_properties: execSearchProperties,
  search_files: execSearchFiles,
  create_property: execCreateProperty,
  search_agenda: execSearchAgenda,
  create_event: execCreateEvent,
  create_follow_up: execCreateFollowUp,
  save_interaction: execSaveInteraction,
  save_miscellaneous: execSaveMiscellaneous,
  create_financial_movement: execCreateFinancialMovement,
  create_deal: execCreateDeal,
  search_deals: execSearchDeals,
  create_prospecting_lead: execCreateProspectingLead,
  search_prospecting_leads: execSearchProspectingLeads,
  update_prospecting_lead: execUpdateProspectingLead,
  update_person: execUpdatePerson,
  update_property: execUpdateProperty,
  archive_record: execArchiveRecord,
  reschedule_reminder: execRescheduleReminder,
  search_active_reminders: execSearchActiveReminders,
  cancel_reminder: execCancelReminder,
  cancel_follow_up: execCancelFollowUp,
  complete_follow_up: execCompleteFollowUp,
  set_routine_active: execSetRoutineActive,
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

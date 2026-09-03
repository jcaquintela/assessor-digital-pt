// Daily Operating Loop — geradores de nudges para consultores com Supreme v1 activo.
// Determinístico e conservador: respeita janela horária, quiet hours, cap diário, dedupe.

import type { NudgeDraft } from "../v3/proactivity.server";
import { sanitizeReply } from "../culture/sanitize";
import { requiresOutcome } from "@/lib/follow-ups/pending";
import { belongsInDailyAgenda } from "../agenda-leisure";
import { isFollowUpOpen, isFollowUpEvent } from "@/lib/follow-ups/state";
import { computePriorities } from "./priorities.server";
import { composeEmptyDayBriefing } from "../proactive/empty-day";
import { composeNoPrioritiesBriefing, type AgendaFactEvent } from "../proactive/day-agenda-facts";
import { loadDayAgendaFacts } from "../proactive/day-agenda-facts.server";
import { formatPreEventNudge, isPreEventDue } from "./pre-event";
import { composeEnrichedBriefing, tightGapsFromAgenda } from "../proactive/briefing-enriched";
import { lisbonYmd, lisbonHhMm } from "../lisbon-day";

export const DAILY_BRIEFING_PREFIX = "supreme_daily_briefing:";
export const EVENING_REVIEW_PREFIX = "supreme_evening_review:";
export const CAP_NOTICE_PREFIX = "supreme_cap_notice:";

/** Aviso (uma vez por dia) de que o teto de avisos/dia está a travar lembretes. */
export function composeCapNotice(cap: number): string {
  return (
    `Hoje já te enviei os ${cap} avisos que definiste como máximo por dia, ` +
    `por isso vou guardar os lembretes seguintes em silêncio. ` +
    `Se quiseres receber mais, diz-me "muda o teto de avisos para 10" ou ajusta em /definicoes.`
  );
}

/** Já avisámos hoje que o teto está atingido? */
async function capNoticeAlreadySent(supabase: any, userId: string, ymd: string): Promise<boolean> {
  const { data } = await supabase
    .from("assessor_nudges")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", `${CAP_NOTICE_PREFIX}${ymd}`)
    .limit(1);
  return Boolean(((data as any[]) ?? []).length);
}

/**
 * O briefing da manhã tem de ser ÚNICO por dia. Existem dois emissores
 * (o push horário `proactive_morning` e este nudge), por isso ambos passam
 * por aqui antes de falar.
 */
export async function morningBriefingAlreadySent(supabase: any, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data: pushed } = await supabase
    .from("assessor_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("message_type", "proactive_morning")
    .gte("created_at", since)
    .limit(1);
  if (((pushed as any[]) ?? []).length) return true;
  const { data: nudged } = await supabase
    .from("assessor_nudges")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "sent")
    .like("dedupe_key", `${DAILY_BRIEFING_PREFIX}%`)
    .gte("sent_at", since)
    .limit(1);
  return Boolean(((nudged as any[]) ?? []).length);
}

/** Texto do briefing a partir das prioridades actuais (nunca de cache). */
export function composeBriefingText(
  priorities: Array<{
    action: string;
    entity_label: string | null;
    reasons: string[];
    subject_type?: string;
    subject_id?: string;
    priority_score?: number;
    deal_id?: string | null;
    event_start_at?: string | null;
  }>,
  opts: {
    firstName?: string;
    now?: Date;
    /** Agenda real do dia — obrigatória para poder dizer "livre" (ver day-agenda-facts). */
    dayEvents?: AgendaFactEvent[] | null;
    /** Conflitos vivos (7 dias) — secção "Conflitos a resolver". */
    conflicts?: import("@/lib/agenda/conflicts").ConflictPair[];
  } = {},
): string {
  const now = opts.now ?? new Date();
  if (!priorities.length) {
    if (opts.dayEvents) return composeNoPrioritiesBriefing(opts.firstName ?? "", opts.dayEvents, now);
    return composeEmptyDayBriefing(opts.firstName ?? "", now);
  }
  return composeEnrichedBriefing(priorities as any, {
    firstName: opts.firstName ?? "",
    now,
    tightGaps: opts.dayEvents ? tightGapsFromAgenda(opts.dayEvents, now) : [],
    conflicts: opts.conflicts ?? [],
  });
}

/**
 * Reavalia o briefing no momento do envio. Entre gerar (madrugada) e enviar
 * (manhã) o consultor pode ter limpo a agenda — o texto guardado ficaria
 * a falar de compromissos já desmarcados.
 */
export async function resolveBriefingAtDispatch(
  supabase: any,
  userId: string,
): Promise<{ send: false } | { send: true; text: string }> {
  if (await morningBriefingAlreadySent(supabase, userId)) return { send: false };
  const priorities = await computePriorities(supabase, userId, { limit: 3 });
  const { data: prof } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
  const firstName = ((prof as any)?.name ?? "").split(" ")[0] ?? "";
  const dayEvents = await loadDayAgendaFacts(supabase, userId);
  const { loadConflictPairs } = await import("@/lib/agenda/conflicts.server");
  const conflicts = await loadConflictPairs(supabase, userId).catch(() => []);
  return {
    send: true,
    text: sanitizeReply(composeBriefingText(priorities, { firstName, dayEvents, conflicts })),
  };
}


// Dia e hora de Lisboa vêm da fonte única (lisbon-day.ts); o dia-da-semana é
// derivado desse mesmo dia de calendário, para não haver dois cálculos de fuso.
const WEEKDAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function nowLisbonParts(now: Date) {
  const ymdDash = lisbonYmd(now);
  const [hh, mm] = lisbonHhMm(now).split(":");
  const [y, m, d] = ymdDash.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return {
    hour: Number(hh ?? "0"),
    minute: Number(mm ?? "0"),
    weekday: WEEKDAY_SHORT[dow]!,
    ymd: ymdDash.replaceAll("-", ""),
    isoDay: dow === 0 ? 7 : dow,
  };
}

function withinWindow(target: string, now: { hour: number; minute: number }, toleranceMin = 15): boolean {
  const [h, mi] = target.split(":").map(Number);
  const t = h * 60 + mi;
  const n = now.hour * 60 + now.minute;
  return Math.abs(n - t) <= toleranceMin;
}

function withinQuietHours(start: string, end: string, now: { hour: number; minute: number }): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  const n = now.hour * 60 + now.minute;
  return s <= e ? (n >= s && n < e) : (n >= s || n < e);
}

// Gera nudges do Daily Loop para UM utilizador Supremo. Não persiste — devolve drafts.
export async function generateSupremeNudges(
  supabase: any,
  userId: string,
  now = new Date(),
): Promise<NudgeDraft[]> {
  const drafts: NudgeDraft[] = [];

  const { data: prefs } = await supabase
    .from("consultant_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const p = prefs ?? {
    morning_briefing_enabled: true, morning_time: "08:00",
    morning_days: [1, 2, 3, 4, 5],
    quiet_hours_start: "22:00", quiet_hours_end: "07:30",
    evening_wrap_enabled: true, evening_time: "19:00",
    max_daily_nudges: 6,
  };

  const nowP = nowLisbonParts(now);
  if (withinQuietHours(p.quiet_hours_start ?? "22:00", p.quiet_hours_end ?? "07:30", nowP)) return [];

  // Cap diário
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from("assessor_nudges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "sent")
    .gte("sent_at", startOfDay.toISOString());
  if ((sentToday ?? 0) >= (p.max_daily_nudges ?? 6)) return [];

  // ------------ Briefing da manhã ------------
  const morningDays: number[] = Array.isArray(p.morning_days) ? p.morning_days : [1, 2, 3, 4, 5];
  if (
    p.morning_briefing_enabled &&
    morningDays.includes(nowP.isoDay) &&
    withinWindow(p.morning_time ?? "08:00", nowP, 15)
  ) {
    if (!(await morningBriefingAlreadySent(supabase, userId))) {
      const priorities = await computePriorities(supabase, userId, { limit: 3, now });
      const dayEvents = await loadDayAgendaFacts(supabase, userId, now);
      drafts.push({
        kind: "consultant_silence" as any, // reutiliza kind existente para respeitar tipos actuais
        subject_type: null,
        subject_id: null,
        reason: "Briefing diário do Assessor Supremo",
        suggested_reply: sanitizeReply(composeBriefingText(priorities, { now, dayEvents })),
        dedupe_key: `${DAILY_BRIEFING_PREFIX}${nowP.ymd}`,
      });
    }
  }

  // ------------ Pré-evento (compromisso a começar em 45–75 min) ------------
  // Janela larga na query (o `due_date` pode ser só a data; a hora vive em
  // `due_time`); o filtro fino usa a hora real de início.
  const winFrom = new Date(now.getTime() - 26 * 3600_000).toISOString();
  const winTo = new Date(now.getTime() + 26 * 3600_000).toISOString();
  const { data: upcomingRaw } = await supabase
    .from("follow_ups")
    .select(
      "id, title, type, due_date, due_time, status, outcome, archived_at, person_id, " +
      "related_property_id, opportunity_id, related_prospecting_lead_id, event_class",
    )
    .eq("user_id", userId)
    .gte("due_date", winFrom)
    .lte("due_date", winTo)
    .limit(100);
  // Regra canónica: evento (não tarefa) e ainda aberto. Aviso de agenda →
  // regra larga (sem lazer), não o filtro estrito dos check-ins.
  const upcoming = ((upcomingRaw as any[]) ?? [])
    .filter((ev) => isFollowUpEvent(ev) && isFollowUpOpen(ev) && belongsInDailyAgenda(ev))
    .filter((ev) => isPreEventDue(ev as any, now.getTime()))
    .slice(0, 3);
  for (const ev of upcoming) {
    let personName: string | null = null;
    if (ev.person_id) {
      const { data: person } = await supabase.from("people").select("name").eq("id", ev.person_id).maybeSingle();
      personName = (person as any)?.name ?? null;
    }
    const dedupe = `supreme_pre_event:${ev.id}`;
    const reply = formatPreEventNudge(ev as any, personName, now.getTime());
    drafts.push({
      kind: "followup_overdue" as any,
      subject_type: "follow_up",
      subject_id: ev.id,
      reason: "Compromisso a começar dentro de pouco tempo.",
      suggested_reply: sanitizeReply(reply),
      dedupe_key: dedupe,
    });
  }

  // ------------ Outcome check (evento acabou há 30–90 min sem outcome) ------------
  const ago90 = new Date(now.getTime() - 90 * 60000).toISOString();
  const ago30 = new Date(now.getTime() - 30 * 60000).toISOString();
  const { data: endedRaw } = await supabase
    .from("follow_ups")
    .select("id, title, type, due_date, due_time, status, archived_at, person_id, related_property_id, opportunity_id, related_prospecting_lead_id, event_class, outcome")
    .eq("user_id", userId)
    .is("outcome", null)
    .gte("due_date", ago90)
    .lte("due_date", ago30)
    .limit(20);
  const ended = ((endedRaw as any[]) ?? [])
    .filter((ev) => isFollowUpEvent(ev) && isFollowUpOpen(ev))
    .slice(0, 3);
  for (const ev of ended) {
    // Reunião interna nunca pede "Como correu?" — só compromissos de negócio.
    if (!requiresOutcome(ev)) continue;
    let personName: string | null = null;
    if (ev.person_id) {
      const { data: person } = await supabase.from("people").select("name").eq("id", ev.person_id).maybeSingle();
      personName = (person as any)?.name ?? null;
    }
    const dedupe = `supreme_outcome_check:${ev.id}`;
    const reply = personName
      ? `Como correu ${ev.title} com ${personName}?`
      : `Como correu ${ev.title}?`;
    drafts.push({
      kind: "followup_overdue" as any,
      subject_type: "follow_up",
      subject_id: ev.id,
      reason: "Compromisso terminou sem resultado registado.",
      suggested_reply: sanitizeReply(reply),
      dedupe_key: dedupe,
    });
  }

  // ------------ Resumo de fim de dia ------------
  // Mesmo caminho de aviso (assessor_nudges), mesmas quiet hours e mesmo cap.
  // Silêncio é sinal: dia sem rasto não gera mensagem nenhuma.
  const eveningDays: number[] = Array.isArray(p.morning_days) ? p.morning_days : [1, 2, 3, 4, 5];
  if (
    (p as any).evening_wrap_enabled !== false &&
    eveningDays.includes(nowP.isoDay) &&
    withinWindow(String((p as any).evening_time ?? "19:00").slice(0, 5), nowP, 15)
  ) {
    const { buildDaySnapshot } = await import("./day-snapshot.server");
    const { composeEveningReview, hasEveningSignal, normalizeEveningDetail } = await import("./evening-review");
    const snapshot = await buildDaySnapshot(supabase, userId, { lens: "fim_de_dia", now });
    if (hasEveningSignal(snapshot)) {
      drafts.push({
        kind: "consultant_silence" as any,
        subject_type: null,
        subject_id: null,
        reason: "Resumo de fim de dia",
        suggested_reply: sanitizeReply(
          composeEveningReview(snapshot, { detail: normalizeEveningDetail((p as any).evening_review_detail) }),
        ),
        dedupe_key: `${EVENING_REVIEW_PREFIX}${nowP.ymd}`,
      });
    }
  }

  const room = (p.max_daily_nudges ?? 6) - (sentToday ?? 0);
  return drafts.slice(0, Math.max(0, room));
}


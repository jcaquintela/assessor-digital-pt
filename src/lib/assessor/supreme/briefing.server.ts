// Daily Operating Loop — geradores de nudges para consultores com Supreme v1 activo.
// Determinístico e conservador: respeita janela horária, quiet hours, cap diário, dedupe.

import type { NudgeDraft } from "../v3/proactivity.server";
import { sanitizeReply } from "../culture/sanitize";
import { requiresOutcome } from "@/lib/follow-ups/pending";
import { belongsInDailyAgenda } from "../agenda-leisure";
import { isFollowUpOpen, isFollowUpEvent } from "@/lib/follow-ups/state";
import { computePriorities } from "./priorities.server";

export const DAILY_BRIEFING_PREFIX = "supreme_daily_briefing:";

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
  priorities: Array<{ action: string; entity_label: string | null; reasons: string[] }>,
): string {
  if (!priorities.length) return "Bom dia. Hoje não tens compromissos nem seguimentos urgentes.";
  const top = priorities[0]!;
  const rest = priorities.length - 1;
  return `Bom dia. Prioridade de hoje: ${top.action}${top.entity_label ? ` (${top.entity_label})` : ""}. ${top.reasons[0] ?? ""}.${rest > 0 ? ` Tens mais ${rest} para tratar.` : ""}`;
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
  if (!priorities.length) return { send: false };
  return { send: true, text: sanitizeReply(composeBriefingText(priorities)) };
}

function nowLisbonParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return {
    hour: Number(m.hour ?? "0"),
    minute: Number(m.minute ?? "0"),
    weekday: (m.weekday ?? "").toLowerCase(),
    ymd: `${m.year}${m.month}${m.day}`,
    isoDay: weekdayIso(m.weekday ?? ""),
  };
}

function weekdayIso(short: string): number {
  const map: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  return map[short.toLowerCase()] ?? 0;
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
      drafts.push({
        kind: "consultant_silence" as any, // reutiliza kind existente para respeitar tipos actuais
        subject_type: null,
        subject_id: null,
        reason: "Briefing diário do Assessor Supremo",
        suggested_reply: sanitizeReply(composeBriefingText(priorities)),
        dedupe_key: `${DAILY_BRIEFING_PREFIX}${nowP.ymd}`,
      });
    }
  }

  // ------------ Pré-evento (compromisso a começar em 45–75 min) ------------
  const in45 = new Date(now.getTime() + 45 * 60000).toISOString();
  const in75 = new Date(now.getTime() + 75 * 60000).toISOString();
  const { data: upcomingRaw } = await supabase
    .from("follow_ups")
    .select("id, title, type, due_date, due_time, status, outcome, archived_at, person_id, related_property_id")
    .eq("user_id", userId)
    .gte("due_date", in45)
    .lte("due_date", in75)
    .limit(20);
  // Regra canónica: evento (não tarefa) e ainda aberto. Aviso de agenda →
  // regra larga (sem lazer), não o filtro estrito dos check-ins.
  const upcoming = ((upcomingRaw as any[]) ?? [])
    .filter((ev) => isFollowUpEvent(ev) && isFollowUpOpen(ev) && belongsInDailyAgenda(ev))
    .slice(0, 3);
  for (const ev of upcoming) {
    let personName: string | null = null;
    if (ev.person_id) {
      const { data: person } = await supabase.from("people").select("name").eq("id", ev.person_id).maybeSingle();
      personName = (person as any)?.name ?? null;
    }
    const dedupe = `supreme_pre_event:${ev.id}`;
    const reply = personName
      ? `Daqui a uma hora tens ${ev.title} com ${personName}. Queres que te prepare o contexto?`
      : `Daqui a uma hora tens ${ev.title}. Queres que te prepare o contexto?`;
    drafts.push({
      kind: "followup_overdue" as any,
      subject_type: "follow_up",
      subject_id: ev.id,
      reason: `Compromisso a começar dentro de uma hora.`,
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

  const room = (p.max_daily_nudges ?? 6) - (sentToday ?? 0);
  return drafts.slice(0, Math.max(0, room));
}

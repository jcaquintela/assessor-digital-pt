// Conflitos de horário → avisos proativos.
//
// Reutiliza o único caminho proativo existente (assessor_nudges + dispatch);
// aqui só se decide QUE pares merecem aviso hoje.

import { findConflicts, pairKeyOf, type ConflictCandidate } from "./conflicts";
import { conflictMessage, conflictReason } from "./conflict-message";
import { isFollowUpOpen } from "@/lib/follow-ups/state";
import { belongsInDailyAgenda } from "@/lib/assessor/agenda-leisure";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";

/** Quantos dias à frente se procuram colisões. */
export const CONFLICT_HORIZON_DAYS = 14;
/** Quantas vezes se insiste no mesmo par antes de passar a Diversos. */
export const CONFLICT_MAX_ATTEMPTS = 3;

export const CONFLICT_NUDGE_KIND = "schedule_conflict";

export interface ConflictNudgeDraft {
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  reason: string;
  suggested_reply: string;
  dedupe_key: string;
}

function todayKey(now: Date): string {
  return lisbonYmd(now).replaceAll("-", "");
}

/** `schedule_conflict:<idA>|<idB>:<YYYYMMDD>` → `<idA>|<idB>` */
export function pairFromDedupeKey(dedupeKey: unknown): string | null {
  const parts = String(dedupeKey ?? "").split(":");
  if (parts[0] !== CONFLICT_NUDGE_KIND || parts.length < 3) return null;
  return parts[1] ?? null;
}

export function conflictDedupeKey(pairKey: string, now: Date): string {
  return `${CONFLICT_NUDGE_KIND}:${pairKey}:${todayKey(now)}`;
}

async function parkInMiscellaneous(
  supabase: any,
  userId: string,
  title: string,
  reason: string,
  now: Date,
): Promise<void> {
  const miscTitle = `Conflito de agenda: ${title}`.slice(0, 120);
  const { data: existing } = await supabase
    .from("miscellaneous_items")
    .select("id")
    .eq("user_id", userId)
    .eq("title", miscTitle)
    .limit(1);
  if (((existing as any[]) ?? []).length) return;
  await supabase.from("miscellaneous_items").insert({
    user_id: userId,
    title: miscTitle,
    original_content: reason,
    summary: `O Afonso avisou ${CONFLICT_MAX_ATTEMPTS} vezes e o conflito manteve-se. Ficou aqui para decidires.`,
    category: "Por tratar",
    source_channel: "proactive",
    status: "inbox",
    occurred_at: now.toISOString(),
    tags: ["agenda", "conflito_horario"],
  } as never);
}

/**
 * Gera avisos de conflito para um consultor.
 * Também fecha (resolved) os avisos cujo par já não colide — sem intervenção.
 */
/**
 * Conflitos vivos de um consultor numa janela de dias. Fonte única: tanto o
 * briefing da manhã como o nudge autónomo leem daqui.
 */
export async function loadConflictPairs(
  supabase: any,
  userId: string,
  opts: { now?: Date; horizonDays?: number } = {},
): Promise<ReturnType<typeof findConflicts>> {
  const now = opts.now ?? new Date();
  const horizonDays = opts.horizonDays ?? CONFLICT_HORIZON_DAYS;
  const horizonEnd = new Date(now.getTime() + horizonDays * 864e5);

  const { data: follows } = await supabase
    .from("follow_ups")
    .select("id, title, type, due_date, due_time, duration_minutes, status, outcome, archived_at, event_class, person_id, opportunity_id, related_property_id, event_category, notes")
    .eq("user_id", userId)
    .is("archived_at", null)
    .gte("due_date", new Date(now.getTime() - 6 * 3600_000).toISOString())
    .lte("due_date", horizonEnd.toISOString())
    .order("due_date", { ascending: true })
    .limit(300);

  const rows = ((follows as any[]) ?? []).filter((f) => {
    if (!isFollowUpOpen(f)) return false;
    if (!belongsInDailyAgenda(f)) return false;
    if (String(f.event_category ?? "") === "aniversarios") return false;
    return true;
  });

  const links = new Map<string, string | null>();
  if (rows.length) {
    const { data: linkRows } = await supabase
      .from("calendar_event_links")
      .select("follow_up_id, series_master_id, deleted")
      .eq("user_id", userId)
      .in("follow_up_id", rows.map((f) => f.id));
    for (const l of ((linkRows as any[]) ?? [])) {
      if (l.deleted) continue;
      links.set(l.follow_up_id, l.series_master_id ?? null);
    }
  }

  const candidates: ConflictCandidate[] = rows.map((f) => ({
    id: f.id,
    title: String(f.title ?? ""),
    due_date: f.due_date,
    due_time: f.due_time,
    duration_minutes: f.duration_minutes ?? null,
    series_id: links.get(f.id) ?? null,
  }));

  return findConflicts(candidates);
}

/**
 * Gera avisos de conflito para um consultor.
 * Também fecha (resolved) os avisos cujo par já não colide — sem intervenção.
 *
 * Os conflitos dentro do horizonte do briefing matinal (7 dias) já são ditos
 * lá; aqui só se cobre o que fica de fora (8–14 dias).
 */
export async function generateConflictNudges(
  supabase: any,
  userId: string,
  opts: { now?: Date; max?: number } = {},
): Promise<ConflictNudgeDraft[]> {
  const now = opts.now ?? new Date();
  const max = opts.max ?? 2;

  const pairs = await loadConflictPairs(supabase, userId, { now });


  // Histórico dos avisos deste tipo — serve para contar tentativas e para
  // fechar os que já não fazem sentido.
  const { data: history } = await supabase
    .from("assessor_nudges")
    .select("id, status, dedupe_key, outcome_at")
    .eq("user_id", userId)
    .eq("kind", CONFLICT_NUDGE_KIND)
    .order("created_at", { ascending: false })
    .limit(200);

  const attempts = new Map<string, number>();
  const openIdsByPair = new Map<string, string[]>();
  for (const row of ((history as any[]) ?? [])) {
    const pair = pairFromDedupeKey(row.dedupe_key);
    if (!pair) continue;
    if (row.status === "sent") attempts.set(pair, (attempts.get(pair) ?? 0) + 1);
    if (row.status === "pending" || row.status === "sent") {
      openIdsByPair.set(pair, [...(openIdsByPair.get(pair) ?? []), row.id]);
    }
  }

  // 1) Conflitos resolvidos entretanto: fecham-se sozinhos.
  const staleIds: string[] = [];
  for (const [pair, ids] of openIdsByPair) {
    if (!livePairKeys.has(pair)) staleIds.push(...ids);
  }
  if (staleIds.length) {
    await supabase
      .from("assessor_nudges")
      .update({ status: "resolved", outcome: "conflito_resolvido", outcome_at: now.toISOString() } as never)
      .in("id", staleIds);
  }

  // 2) Novos avisos.
  const drafts: ConflictNudgeDraft[] = [];
  for (const pair of pairs) {
    if (drafts.length >= max) break;
    const key = pairKeyOf(pair.a.id, pair.b.id);
    // Já há um aviso por enviar para este par: não empilha.
    const open = openIdsByPair.get(key) ?? [];
    if (open.length && attempts.get(key) === undefined) continue;
    const tries = attempts.get(key) ?? 0;
    if (tries >= CONFLICT_MAX_ATTEMPTS) {
      await parkInMiscellaneous(
        supabase,
        userId,
        `${pair.a.title} vs ${pair.b.title}`,
        conflictReason(pair, now),
        now,
      );
      if (open.length) {
        await supabase
          .from("assessor_nudges")
          .update({ status: "dismissed", outcome: "manual_follow_up", outcome_at: now.toISOString() } as never)
          .in("id", open);
      }
      continue;
    }
    drafts.push({
      kind: CONFLICT_NUDGE_KIND,
      subject_type: "follow_up",
      subject_id: pair.a.id,
      reason: conflictReason(pair, now),
      suggested_reply: conflictMessage(pair, now),
      dedupe_key: conflictDedupeKey(key, now),
    });
  }
  return drafts;
}

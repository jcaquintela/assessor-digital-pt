// Agregador único do dia — serve o briefing da manhã e o resumo de fim de dia.
//
// Não há dois "resumidores": muda a LENTE, não o mecanismo. A lente "manha"
// olha para a frente (o que há para fazer hoje); a lente "fim_de_dia" olha
// para trás (o que aconteceu) e antecipa amanhã. As fontes são sempre as que
// já existem — nenhuma query nova de negócio nasce aqui.

import { lisbonYmd, lisbonInstant } from "@/lib/assessor/lisbon-day";
import { isFollowUpClosed, isFollowUpEvent } from "@/lib/follow-ups/state";
import { belongsInDailyAgenda } from "@/lib/assessor/agenda-leisure";
import { computePriorities, type PriorityItem } from "./priorities.server";

export type DayLens = "manha" | "fim_de_dia";

export interface SnapshotVisit {
  label: string;
  summary: string | null;
}

export interface SnapshotFollowUp {
  id: string;
  title: string;
  person: string | null;
}

export interface SnapshotDeadline {
  label: string;
  when: string;
  deal_label: string;
  due_date: string;
}

export interface DaySnapshot {
  lens: DayLens;
  ymd: string;
  /** Visitas registadas hoje (interações + eventos de visita fechados). */
  visits: SnapshotVisit[];
  /** Compromissos/tarefas de hoje já fechados. */
  closed: SnapshotFollowUp[];
  /** Compromissos/tarefas de hoje ainda em aberto. */
  openToday: SnapshotFollowUp[];
  /** Rascunhos/ações à espera de confirmação do consultor. */
  pendingConfirmations: number;
  /** Itens em Diversos por tratar. */
  miscInbox: number;
  /** Prazos de negócio dentro da janela de aviso. */
  deadlines: SnapshotDeadline[];
  /** Prioridades de hoje (lente "manha"). */
  todayPriorities: PriorityItem[];
  /** Prioridades de amanhã (lente "fim_de_dia"). */
  tomorrow: PriorityItem[];
}

function dayBounds(now: Date): { ymd: string; startIso: string; endIso: string } {
  const ymd = lisbonYmd(now);
  const startIso = new Date(lisbonInstant(ymd, 0, 0, 0)).toISOString();
  const endIso = new Date(lisbonInstant(ymd, 23, 59, 59)).toISOString();
  return { ymd, startIso, endIso };
}

function tomorrowBounds(now: Date): { start: Date; end: Date } {
  const [y, m, d] = lisbonYmd(now).split("-").map(Number);
  const ymd = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  return {
    start: new Date(lisbonInstant(ymd, 0, 0, 0)),
    end: new Date(lisbonInstant(ymd, 12, 0, 0)),
  };
}

export async function buildDaySnapshot(
  supabase: any,
  userId: string,
  opts: { lens: DayLens; now?: Date },
): Promise<DaySnapshot> {
  const now = opts.now ?? new Date();
  const lens = opts.lens;
  const { ymd, startIso, endIso } = dayBounds(now);

  const snapshot: DaySnapshot = {
    lens,
    ymd,
    visits: [],
    closed: [],
    openToday: [],
    pendingConfirmations: 0,
    miscInbox: 0,
    deadlines: [],
    todayPriorities: [],
    tomorrow: [],
  };

  // ---- Prioridades (fonte única, muda só a janela) ----
  if (lens === "manha") {
    snapshot.todayPriorities = await computePriorities(supabase, userId, { limit: 3, now });
  } else {
    const { start, end } = tomorrowBounds(now);
    snapshot.tomorrow = await computePriorities(supabase, userId, {
      limit: 3, now, windowStart: start, windowEnd: end,
    });
  }

  // ---- Prazos de negócio ----
  try {
    const { deadlinesInNoticeWindow } = await import("@/lib/deals/deadlines.server");
    snapshot.deadlines = (await deadlinesInNoticeWindow(supabase, userId, now)).map((d: any) => ({
      label: String(d.label ?? d.action ?? "Prazo"),
      when: String(d.when ?? ""),
      deal_label: String(d.deal_label ?? "Negócio"),
      due_date: String(d.due_date).slice(0, 10),
    }));
  } catch { /* prazos são complemento */ }

  // ---- Pendentes por confirmar + Diversos por tratar ----
  try {
    const [{ count: pend }, { count: misc }] = await Promise.all([
      supabase
        .from("pending_actions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["pending_confirmation", "collecting_information", "correction_pending"]),
      supabase
        .from("miscellaneous_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "inbox"),
    ]);
    snapshot.pendingConfirmations = pend ?? 0;
    snapshot.miscInbox = misc ?? 0;
  } catch { /* contagens são complemento */ }

  // A parte retrospetiva só interessa à lente de fim de dia.
  if (lens === "manha") return snapshot;

  // ---- O que aconteceu hoje: compromissos e visitas ----
  const { data: rows } = await supabase
    .from("follow_ups")
    .select("id, title, type, status, outcome, archived_at, due_date, due_time, person_id, event_class")
    .eq("user_id", userId)
    .gte("due_date", startIso)
    .lte("due_date", endIso)
    .limit(100);

  const todayRows = ((rows as any[]) ?? []).filter(
    (f) => !isFollowUpEvent(f) || belongsInDailyAgenda(f),
  );
  const personIds = [...new Set(todayRows.map((f) => f.person_id).filter(Boolean))];
  const nameById = new Map<string, string>();
  if (personIds.length) {
    const { data: people } = await supabase.from("people").select("id, name").in("id", personIds);
    for (const p of ((people as any[]) ?? [])) nameById.set(p.id, p.name);
  }
  for (const f of todayRows) {
    const item: SnapshotFollowUp = {
      id: String(f.id),
      title: String(f.title ?? "").trim() || "Compromisso",
      person: f.person_id ? nameById.get(f.person_id) ?? null : null,
    };
    if (f.archived_at) continue;
    if (isFollowUpClosed(f)) snapshot.closed.push(item);
    else snapshot.openToday.push(item);
  }

  try {
    const { loadVisitSources } = await import("@/lib/people/visit-followups.server");
    const src = await loadVisitSources(supabase, userId, startIso);
    const pName = new Map<string, string>();
    for (const p of src.people) pName.set(p.id, String(p.name ?? ""));
    const propName = new Map<string, string>();
    for (const p of src.properties) propName.set(p.id, String(p.title ?? p.address ?? ""));
    for (const v of src.visits) {
      if (lisbonYmd(v.occurred_at ?? "") !== ymd) continue;
      const who = v.person_id ? pName.get(v.person_id) ?? null : null;
      const where = v.property_id ? propName.get(v.property_id) ?? null : null;
      const label = [who, where].filter(Boolean).join(" — ") || "Visita";
      snapshot.visits.push({ label, summary: v.summary ?? null });
    }
  } catch { /* visitas são complemento */ }

  return snapshot;
}

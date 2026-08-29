// Prazos de negócio — leitura, escrita e antecipação (servidor).
//
// Fonte única: `deal_deadlines`. Quem avisa é sempre o caminho já validado
// (computePriorities + assessor_nudges); aqui só produzimos os dados.

import { lisbonYmd } from "@/lib/assessor/lisbon-day";
import {
  DEADLINE_AUTOCLOSE_DAYS,
  daysUntilDeadline,
  deadlineAction,
  deadlineDedupeKey,
  deadlineWhen,
  isDeadlineOpen,
  isDeadlineStale,
  isInNoticeWindow,
  noticeDaysOf,
  type DeadlineRow,
  type DeadlineStatus,
} from "./deadlines";
import { isDealActive } from "./stages";

export interface DeadlineWithDeal extends DeadlineRow {
  deal_label: string;
}

/** Prazos de um consultor, já com o nome do negócio e só de negócios ativos. */
export async function listDeadlines(
  supabase: any,
  userId: string,
  opts: { opportunityId?: string | null; includeClosed?: boolean } = {},
): Promise<DeadlineWithDeal[]> {
  let q = supabase
    .from("deal_deadlines")
    .select("id, opportunity_id, label, due_date, status, notes, notice_days, archived_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("due_date", { ascending: true })
    .limit(200);
  if (opts.opportunityId) q = q.eq("opportunity_id", opts.opportunityId);
  const { data } = await q;
  let rows = ((data as any[]) ?? []) as DeadlineRow[];
  if (!opts.includeClosed) rows = rows.filter(isDeadlineOpen);
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((r) => r.opportunity_id))];
  const { data: deals } = await supabase
    .from("opportunities")
    .select("id, title, stage, status, archived_at")
    .in("id", ids);
  const byId = new Map<string, any>();
  for (const d of ((deals as any[]) ?? [])) byId.set(d.id, d);

  return rows
    .filter((r) => {
      const d = byId.get(r.opportunity_id);
      return !d || isDealActive(d) || opts.opportunityId;
    })
    .map((r) => ({
      ...r,
      deal_label: String(byId.get(r.opportunity_id)?.title ?? "").trim() || "Negócio",
    }));
}

export async function addDeadline(
  supabase: any,
  userId: string,
  input: {
    opportunityId: string;
    label: string;
    dueDate: string;
    noticeDays?: number | null;
    notes?: string | null;
  },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("deal_deadlines")
    .insert({
      user_id: userId,
      opportunity_id: input.opportunityId,
      label: String(input.label ?? "").trim().slice(0, 120) || "Prazo",
      due_date: input.dueDate,
      notice_days: input.noticeDays ?? null,
      notes: input.notes ?? null,
      status: "aberto",
    } as never)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { id: String((data as any)?.id ?? "") };
}

export async function setDeadlineStatus(
  supabase: any,
  userId: string,
  id: string,
  status: DeadlineStatus,
): Promise<void> {
  const { error } = await supabase
    .from("deal_deadlines")
    .update({ status } as never)
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Correção de data — só depois de confirmação explícita do consultor. */
export async function updateDeadlineDate(
  supabase: any,
  userId: string,
  id: string,
  dueDate: string,
): Promise<void> {
  const { error } = await supabase
    .from("deal_deadlines")
    .update({ due_date: dueDate } as never)
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Antecipação ------------------------------------------------------

export interface DeadlineAlert extends DeadlineWithDeal {
  days_left: number;
  score: number;
  when: string;
  action: string;
}

/** Prazos que hoje estão dentro da janela de aviso. */
export async function deadlinesInNoticeWindow(
  supabase: any,
  userId: string,
  now: Date = new Date(),
): Promise<DeadlineAlert[]> {
  const today = lisbonYmd(now);
  const rows = await listDeadlines(supabase, userId);
  const out: DeadlineAlert[] = [];
  for (const r of rows) {
    const daysLeft = daysUntilDeadline(String(r.due_date).slice(0, 10), today);
    // Já passou tempo de mais sem reação: fecha-se noutro sítio, não avisa.
    if (isDeadlineStale(String(r.due_date).slice(0, 10), today)) continue;
    if (!isInNoticeWindow(daysLeft, noticeDaysOf(r))) continue;
    const { deadlineScore } = await import("./deadlines");
    out.push({
      ...r,
      days_left: daysLeft,
      score: deadlineScore(daysLeft),
      when: deadlineWhen(daysLeft),
      action: deadlineAction(r.label),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Drafts de nudge — mesmo caminho proativo único (`assessor_nudges`). */
export async function generateDeadlineNudges(
  supabase: any,
  userId: string,
  opts: { max?: number; now?: Date } = {},
): Promise<Array<{
  kind: "deal_deadline";
  subject_type: string;
  subject_id: string;
  reason: string;
  suggested_reply: string;
  dedupe_key: string;
}>> {
  const now = opts.now ?? new Date();
  const today = lisbonYmd(now);
  const alerts = await deadlinesInNoticeWindow(supabase, userId, now);
  return alerts.slice(0, opts.max ?? 2).map((a) => ({
    kind: "deal_deadline" as const,
    subject_type: "deal_deadline",
    subject_id: a.id,
    reason: `Prazo "${a.label}" do negócio ${a.deal_label} ${a.when}.`,
    suggested_reply: `O prazo "${a.label}" do negócio ${a.deal_label} ${a.when}. Está tudo encaminhado?`,
    dedupe_key: deadlineDedupeKey(a.id, today),
  }));
}

/**
 * Prazo vencido há N dias sem qualquer ação: fecha-se sozinho e cai em
 * Diversos "Por tratar", com contexto suficiente para o consultor retomar.
 */
export async function closeStaleDeadlines(
  supabase: any,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const today = lisbonYmd(now);
  const rows = await listDeadlines(supabase, userId);
  let fechados = 0;
  for (const r of rows) {
    if (!isDeadlineStale(String(r.due_date).slice(0, 10), today)) continue;
    const title = `Prazo por tratar: ${r.label} (${r.deal_label})`.slice(0, 120);
    const { data: existing } = await supabase
      .from("miscellaneous_items")
      .select("id")
      .eq("user_id", userId)
      .eq("title", title)
      .limit(1);
    if (!((existing as any[]) ?? []).length) {
      await supabase.from("miscellaneous_items").insert({
        user_id: userId,
        title,
        original_content: `Prazo "${r.label}" do negócio ${r.deal_label} estava marcado para ${String(r.due_date).slice(0, 10)}.`,
        summary: `Passaram ${DEADLINE_AUTOCLOSE_DAYS} dias sem nenhuma ação sobre este prazo. O Afonso deixou de insistir e guardou-o aqui.`,
        category: "Por tratar",
        source_channel: "proactive",
        status: "inbox",
        occurred_at: new Date().toISOString(),
        tags: ["prazo", "negócio", "proatividade_esgotada"],
        item_class: "genuino",
      } as never);
    }
    await supabase
      .from("deal_deadlines")
      .update({ status: "cancelado", archived_at: new Date().toISOString() } as never)
      .eq("user_id", userId)
      .eq("id", r.id);
    fechados++;
  }
  return fechados;
}

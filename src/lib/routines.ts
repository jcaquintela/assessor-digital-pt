import { supabase } from "@/integrations/supabase/client";

export type Frequency = "daily" | "weekly" | "monthly";

export interface Routine {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  frequency: Frequency;
  interval_n: number;
  weekday: number | null;
  day_of_month: number | null;
  time_of_day: string | null;
  next_run_at: string;
  last_run_at: string | null;
  priority: "Alta" | "Média" | "Baixa";
  person_id: string | null;
  opportunity_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const FREQ_LABEL: Record<Frequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
};

/** Compute the next occurrence strictly AFTER `from`. */
export function computeNextRun(
  routine: Pick<Routine, "frequency" | "interval_n" | "weekday" | "day_of_month" | "time_of_day">,
  from: Date = new Date(),
): Date {
  const [hh, mm] = (routine.time_of_day ?? "09:00").split(":").map((n) => Number(n) || 0);
  const step = Math.max(1, routine.interval_n || 1);

  if (routine.frequency === "daily") {
    const d = new Date(from);
    d.setHours(hh, mm, 0, 0);
    if (d <= from) d.setDate(d.getDate() + step);
    return d;
  }

  if (routine.frequency === "weekly") {
    const target = routine.weekday ?? from.getDay();
    const d = new Date(from);
    d.setHours(hh, mm, 0, 0);
    const diff = (target - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    if (d <= from) d.setDate(d.getDate() + 7 * step);
    return d;
  }

  // monthly
  const dom = routine.day_of_month ?? from.getDate();
  const d = new Date(from);
  d.setDate(1);
  d.setHours(hh, mm, 0, 0);
  const applyDom = (base: Date) => {
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(dom, daysInMonth));
  };
  applyDom(d);
  if (d <= from) {
    d.setDate(1);
    d.setMonth(d.getMonth() + step);
    applyDom(d);
  }
  return d;
}

/** For each due routine, insert a follow_up and advance next_run_at. */
export async function materializeDueRoutines(): Promise<number> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return 0;

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("routines")
    .select("*")
    .eq("user_id", uid)
    .eq("active", true)
    .lte("next_run_at", nowIso);
  if (error) throw error;

  let created = 0;
  for (const r of (due ?? []) as Routine[]) {
    const runAt = new Date(r.next_run_at);
    const time = r.time_of_day || (runAt.toISOString().slice(11, 16));
    const { error: insErr } = await supabase.from("follow_ups").insert({
      user_id: uid,
      type: "Tarefa",
      title: r.title,
      due_date: runAt.toISOString(),
      due_time: time,
      person_id: r.person_id,
      opportunity_id: r.opportunity_id,
      status: "Pendente",
      priority: r.priority,
      notes: r.notes ? `[Rotina] ${r.notes}` : "[Rotina]",
      source_channel: "app",
      external_reference: `routine:${r.id}`,
      timezone: "Europe/Lisbon",
      created_by_assessor: false,
    } as never);
    if (insErr) continue;

    const next = computeNextRun(r, new Date());
    await supabase.from("routines").update({
      last_run_at: nowIso,
      next_run_at: next.toISOString(),
    } as never).eq("id", r.id);
    created += 1;
  }
  return created;
}
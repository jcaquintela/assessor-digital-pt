// Materialização de rotinas (lembretes recorrentes) no servidor.
//
// Antes disto, uma rotina só se transformava em seguimento quando o
// consultor abria /rotinas no dashboard. Um pedido feito por WhatsApp
// ("lembra-me a agenda todos os dias às 9:45") nunca chegava a avisar.
// Agora o cron proativo trata disso.

import { appSourceColumns } from "./follow-ups-source";

export interface RoutineRow {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  frequency: "daily" | "weekly" | "monthly";
  interval_n: number | null;
  weekday: number | null;
  day_of_month: number | null;
  time_of_day: string | null;
  next_run_at: string;
  person_id: string | null;
  opportunity_id: string | null;
  priority: string | null;
}

/** Próxima ocorrência estritamente depois de `from` (hora local do servidor UTC + hora guardada). */
export function nextRunAfter(r: RoutineRow, from: Date): Date {
  const [hh, mm] = (r.time_of_day ?? "09:00").split(":").map((n) => Number(n) || 0);
  const step = Math.max(1, r.interval_n ?? 1);
  const d = new Date(from);
  d.setUTCHours(hh, mm, 0, 0);

  if (r.frequency === "weekly") {
    const target = r.weekday ?? d.getUTCDay();
    const diff = (target - d.getUTCDay() + 7) % 7;
    d.setUTCDate(d.getUTCDate() + diff);
    if (d <= from) d.setUTCDate(d.getUTCDate() + 7 * step);
    return d;
  }

  if (r.frequency === "monthly") {
    const dom = r.day_of_month ?? d.getUTCDate();
    const clamp = () => {
      const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(dom, days));
    };
    d.setUTCDate(1);
    clamp();
    if (d <= from) {
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + step);
      clamp();
    }
    return d;
  }

  if (d <= from) d.setUTCDate(d.getUTCDate() + step);
  return d;
}

/**
 * Para cada rotina vencida: cria o seguimento do dia, agenda o aviso no canal
 * e avança `next_run_at`. Idempotente por `external_reference`.
 */
export async function materializeDueRoutinesServer(
  supabase: any,
  opts: { now?: Date } = {},
): Promise<{ created: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const { data: due } = await supabase
    .from("routines")
    .select("*")
    .eq("active", true)
    .lte("next_run_at", now.toISOString())
    .limit(200);

  let created = 0;
  let skipped = 0;
  for (const r of ((due as RoutineRow[]) ?? [])) {
    const runAt = new Date(r.next_run_at);
    const ref = `routine:${r.id}:${runAt.toISOString().slice(0, 10)}`;

    const { data: already } = await supabase
      .from("follow_ups")
      .select("id")
      .eq("user_id", r.user_id)
      .eq("external_reference", ref)
      .limit(1);
    if (((already as any[]) ?? []).length) {
      skipped += 1;
    } else {
      const { data: inserted } = await supabase
        .from("follow_ups")
        .insert({
          user_id: r.user_id,
          type: "tarefa",
          title: r.title,
          due_date: runAt.toISOString(),
          due_time: r.time_of_day ?? runAt.toISOString().slice(11, 16),
          person_id: r.person_id,
          opportunity_id: r.opportunity_id,
          status: "pendente",
          priority: r.priority ?? "Média",
          notes: r.notes ? `[Rotina] ${r.notes}` : "[Rotina]",
          ...appSourceColumns({ externalReference: ref }),
        } as never)
        .select("id")
        .maybeSingle();

      if (inserted?.id) {
        created += 1;
        try {
          const { upsertReminder } = await import("./v3/reminders.server");
          await upsertReminder(supabase, {
            userId: r.user_id,
            related_resource_type: "follow_up",
            related_resource_id: inserted.id,
            scheduled_for: runAt.toISOString(),
            timezone: "Europe/Lisbon",
            message_preview: r.title,
            idempotency_key: ref,
          } as never);
        } catch { /* o seguimento fica criado mesmo se o aviso falhar */ }
      }
    }

    const next = nextRunAfter(r, new Date(Math.max(now.getTime(), runAt.getTime())));
    await supabase
      .from("routines")
      .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString() } as never)
      .eq("id", r.id);
  }
  return { created, skipped };
}
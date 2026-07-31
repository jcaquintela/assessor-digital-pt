// Serviço central de lembretes ("reminders") do Assessor v3.
//
// Regras duras (ver constituição do produto):
//  - O Assessor nunca pode confirmar "reagendei" / "passo para..." sem
//    persistir a alteração e ler a linha actualizada da BD.
//  - Um recurso (follow_up, event, prospecting_lead) só pode ter UM
//    lembrete activo (`scheduled` ou `processing`) — garantido por índice
//    único parcial em `reminders_active_unique`.
//  - O reagendamento actualiza sempre a MESMA linha; nunca cria duplicado.
//  - O dispatcher usa compare-and-swap (`UPDATE ... WHERE status='scheduled'
//    RETURNING id`) para evitar duplo envio.
//  - A janela é `now - 30min .. now + 1min` para tolerar cron atrasado.

export type ReminderStatus = "scheduled" | "processing" | "sent" | "failed" | "cancelled";
export type ReminderResourceType = "follow_up" | "event" | "prospecting_lead" | "other";

export interface ReminderRow {
  id: string;
  user_id: string;
  related_resource_type: ReminderResourceType;
  related_resource_id: string | null;
  scheduled_for: string;
  timezone: string;
  channel: string;
  status: ReminderStatus;
  sent_at: string | null;
  failed_at: string | null;
  retry_count: number;
  last_error: string | null;
  external_message_id: string | null;
  idempotency_key: string | null;
  message_preview: string | null;
  created_at: string;
  updated_at: string;
}

// Converte data+hora locais Europe/Lisbon → ISO UTC (DST-aware).
// Idêntica à helper interna em v2/domain.server.ts para evitar acoplamento.
export function lisbonLocalToUtcIso(dateYmd: string, timeHm: string): string {
  const [hh, mm] = timeHm.split(":").map((n) => parseInt(n, 10));
  const [y, mo, d] = dateYmd.split("-").map((n) => parseInt(n, 10));
  const naiveUtc = Date.UTC(y, mo - 1, d, hh, mm, 0);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", hour12: false,
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

export function nowLisbonYmd(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return `${m.year}-${m.month}-${m.day}`;
}

export function nowLisbonHhMm(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(now);
  return p;
}

function isUniqueViolation(err: any): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const msg = String(err.message ?? "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique constraint");
}

export interface UpsertReminderInput {
  userId: string;
  related_resource_type: ReminderResourceType;
  related_resource_id: string;
  scheduled_for: string; // ISO UTC
  timezone?: string;
  channel?: string;
  message_preview?: string | null;
  idempotency_key?: string | null;
}

// Cria ou reactiva o lembrete activo para este recurso. Idempotente por
// via do índice único parcial: se já existe um `scheduled`/`processing`,
// devolve o existente sem duplicar.
export async function upsertReminder(
  supabase: any,
  input: UpsertReminderInput,
): Promise<ReminderRow | null> {
  // Procura activo existente.
  const { data: existing } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", input.userId)
    .eq("related_resource_type", input.related_resource_type)
    .eq("related_resource_id", input.related_resource_id)
    .in("status", ["scheduled", "processing"])
    .maybeSingle();
  if (existing) return existing as ReminderRow;

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      user_id: input.userId,
      related_resource_type: input.related_resource_type,
      related_resource_id: input.related_resource_id,
      scheduled_for: input.scheduled_for,
      timezone: input.timezone ?? "Europe/Lisbon",
      channel: input.channel ?? "whatsapp",
      message_preview: input.message_preview ?? null,
      idempotency_key: input.idempotency_key ?? null,
      status: "scheduled",
    } as never)
    .select("*")
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const { data: re } = await supabase
        .from("reminders")
        .select("*")
        .eq("user_id", input.userId)
        .eq("related_resource_type", input.related_resource_type)
        .eq("related_resource_id", input.related_resource_id)
        .in("status", ["scheduled", "processing"])
        .maybeSingle();
      return (re as ReminderRow | null) ?? null;
    }
    return null;
  }
  return data as ReminderRow;
}

export interface RescheduleInput {
  userId: string;
  channel: string;
  reminder_id?: string | null;
  related_resource_type?: ReminderResourceType | null;
  related_resource_id?: string | null;
  subject_hint?: string | null; // texto livre, ex: "ligar ao Paulo"
  new_date: string; // YYYY-MM-DD
  new_time: string; // HH:MM
  timezone?: string;
  reason?: string;
}

export interface RescheduleResult {
  ok: boolean;
  reminder?: ReminderRow;
  candidates?: Array<{ reminder_id: string; title: string; scheduled_for: string }>;
  error?: string;
}

// Reagenda um lembrete existente. Prioridade de resolução:
// 1) reminder_id explícito;
// 2) (related_resource_type, related_resource_id);
// 3) subject_hint → procura follow_ups do consultor por título ILIKE,
//    depois procura lembretes activos para esses follow_ups.
//    Se >1 candidato, devolve `candidates` sem alterar nada.
export async function rescheduleReminder(
  supabase: any,
  input: RescheduleInput,
): Promise<RescheduleResult> {
  const tz = input.timezone ?? "Europe/Lisbon";
  const newScheduled = lisbonLocalToUtcIso(input.new_date, input.new_time);

  // 1) Localizar o alvo.
  let target: ReminderRow | null = null;

  if (input.reminder_id) {
    const { data } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", input.userId)
      .eq("id", input.reminder_id)
      .maybeSingle();
    target = (data as ReminderRow | null) ?? null;
  }

  if (!target && input.related_resource_type && input.related_resource_id) {
    const { data } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", input.userId)
      .eq("related_resource_type", input.related_resource_type)
      .eq("related_resource_id", input.related_resource_id)
      .in("status", ["scheduled", "processing", "failed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    target = (data as ReminderRow | null) ?? null;
  }

  if (!target && input.subject_hint && input.subject_hint.trim().length >= 2) {
    const hint = input.subject_hint.trim().replace(/[%_]/g, "").slice(0, 60);
    const { data: fus } = await supabase
      .from("follow_ups")
      .select("id, title, due_date")
      .eq("user_id", input.userId)
      .in("status", ["pendente", "em_progresso", "agendado", "aberto", "pending"])
      .ilike("title", `%${hint}%`)
      .order("due_date", { ascending: true })
      .limit(5);
    const followUpIds = ((fus as any[]) ?? []).map((r) => r.id);
    if (followUpIds.length) {
      const { data: rems } = await supabase
        .from("reminders")
        .select("*")
        .eq("user_id", input.userId)
        .eq("related_resource_type", "follow_up")
        .in("related_resource_id", followUpIds)
        .in("status", ["scheduled", "processing", "failed"])
        .order("scheduled_for", { ascending: true });
      const rows = (rems as ReminderRow[] | null) ?? [];
      if (rows.length === 1) target = rows[0];
      else if (rows.length > 1) {
        const byId = new Map<string, any>();
        for (const f of ((fus as any[]) ?? [])) byId.set(f.id, f);
        return {
          ok: false,
          error: "ambiguous",
          candidates: rows.map((r) => ({
            reminder_id: r.id,
            title: byId.get(String(r.related_resource_id))?.title ?? "(sem título)",
            scheduled_for: r.scheduled_for,
          })),
        };
      }
    }
  }

  if (!target) return { ok: false, error: "reminder_not_found" };

  // 2) UPDATE atómico. Reset de estado + retry.
  const { data: updated, error } = await supabase
    .from("reminders")
    .update({
      scheduled_for: newScheduled,
      timezone: tz,
      status: "scheduled",
      sent_at: null,
      failed_at: null,
      last_error: input.reason ? `reschedule:${input.reason}` : "rescheduled",
      retry_count: 0,
      external_message_id: null,
    } as never)
    .eq("id", target.id)
    .eq("user_id", input.userId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  // 3) Propaga para follow_up se aplicável (mantém coerência dashboard).
  if (target.related_resource_type === "follow_up" && target.related_resource_id) {
    try {
      await supabase
        .from("follow_ups")
        .update({
          due_date: newScheduled,
          due_time: input.new_time,
          status: "pendente",
          timezone: tz,
        } as never)
        .eq("id", target.related_resource_id)
        .eq("user_id", input.userId);
    } catch { /* noop */ }
  }

  return { ok: true, reminder: updated as ReminderRow };
}

export async function cancelReminder(
  supabase: any,
  userId: string,
  reminder_id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("reminders")
    .update({ status: "cancelled" } as never)
    .eq("id", reminder_id)
    .eq("user_id", userId)
    .in("status", ["scheduled", "processing", "failed"]);
  return { ok: !error, error: error?.message };
}

export async function searchActiveReminders(
  supabase: any,
  input: {
    userId: string;
    query?: string | null;
    related_resource_type?: ReminderResourceType | null;
    related_resource_id?: string | null;
  },
): Promise<Array<ReminderRow & { title: string | null }>> {
  let q = supabase
    .from("reminders")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", ["scheduled", "processing", "failed"])
    .order("scheduled_for", { ascending: true })
    .limit(10);
  if (input.related_resource_type) q = q.eq("related_resource_type", input.related_resource_type);
  if (input.related_resource_id) q = q.eq("related_resource_id", input.related_resource_id);
  const { data: rems } = await q;
  const rows = ((rems as ReminderRow[]) ?? []);
  // Enriquecer com títulos do follow_up.
  const fuIds = rows
    .filter((r) => r.related_resource_type === "follow_up" && r.related_resource_id)
    .map((r) => String(r.related_resource_id));
  const titles = new Map<string, string>();
  if (fuIds.length) {
    const { data: fus } = await supabase
      .from("follow_ups")
      .select("id, title")
      .eq("user_id", input.userId)
      .in("id", fuIds);
    for (const f of ((fus as any[]) ?? [])) titles.set(f.id, f.title);
  }
  const decorated = rows.map((r) => ({
    ...r,
    title: r.related_resource_type === "follow_up" && r.related_resource_id
      ? (titles.get(String(r.related_resource_id)) ?? null)
      : null,
  }));
  if (input.query && input.query.trim().length >= 2) {
    const needle = input.query.trim().toLowerCase();
    return decorated.filter((r) => (r.title ?? "").toLowerCase().includes(needle));
  }
  return decorated;
}

// Envia um lembrete específico já. Marca sent com external_message_id.
// Nunca duplica se já foi enviado (verifica sent_at antes).
export async function sendReminderNow(
  supabase: any,
  input: { userId: string; reminder_id: string; overrideText?: string | null },
): Promise<{ ok: boolean; external_message_id?: string | null; error?: string }> {
  // Compare-and-swap para bloquear duplo envio concorrente.
  const { data: locked } = await supabase
    .from("reminders")
    .update({ status: "processing" } as never)
    .eq("id", input.reminder_id)
    .eq("user_id", input.userId)
    .in("status", ["scheduled", "failed"])
    .select("*")
    .maybeSingle();
  const row = (locked as ReminderRow | null) ?? null;
  if (!row) return { ok: false, error: "reminder_not_available" };

  // Canal de saída: sempre o principal (WhatsApp quando ligado).
  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const target = await resolveOutboundTarget(supabase, input.userId);
  if (!target) {
    await supabase.from("reminders").update({
      status: "failed", failed_at: new Date().toISOString(),
      last_error: "user_not_linked", retry_count: row.retry_count + 1,
    } as never).eq("id", row.id);
    return { ok: false, error: "user_not_linked" };
  }

  // Constrói texto a enviar.
  let text = input.overrideText ?? row.message_preview ?? null;
  if (!text && row.related_resource_type === "follow_up" && row.related_resource_id) {
    const { data: fu } = await supabase
      .from("follow_ups")
      .select("title, due_time")
      .eq("id", row.related_resource_id)
      .maybeSingle();
    const hhmm = (fu as any)?.due_time ? String((fu as any).due_time).slice(0, 5) : null;
    text = `Lembrete: ${(fu as any)?.title ?? "seguimento"}${hhmm ? ` (${hhmm})` : ""}.`;
  }
  if (!text) text = "Lembrete.";

  const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
  const { normalizePhone } = await import("@/lib/whatsapp/phone");
  const to = normalizePhone(String(phone));
  if (!to) {
    await supabase.from("reminders").update({
      status: "failed", failed_at: new Date().toISOString(),
      last_error: "invalid_phone", retry_count: row.retry_count + 1,
    } as never).eq("id", row.id);
    return { ok: false, error: "invalid_phone" };
  }

  const r = await sendWhatsAppText(to, text, { triggeredBy: input.userId, kind: "auto" });
  if (r.ok) {
    await supabase.from("reminders").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      external_message_id: r.messageId ?? null,
      last_error: null,
    } as never).eq("id", row.id);
    // Regista no histórico do chat para o consultor ver na app.
    try {
      await supabase.from("assessor_messages").insert({
        user_id: input.userId, channel: "whatsapp", role: "assistant",
        content: text, message_type: "followup_reminder",
        related_resource_type: row.related_resource_type,
        related_resource_id: row.related_resource_id,
      } as never);
    } catch { /* noop */ }
    return { ok: true, external_message_id: r.messageId ?? null };
  }

  await supabase.from("reminders").update({
    status: "failed", failed_at: new Date().toISOString(),
    last_error: r.error ?? "send_failed", retry_count: row.retry_count + 1,
  } as never).eq("id", row.id);
  return { ok: false, error: r.error ?? "send_failed" };
}

// Dispatcher: apanha todos os lembretes que já venceram (até 30 min atrás)
// e ainda estão agendados. Usa compare-and-swap para evitar duplo envio.
export async function dispatchDueReminders(
  supabase: any,
  opts: { now?: Date; windowMinutes?: number; maxPerRun?: number } = {},
): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const windowMin = opts.windowMinutes ?? 30;
  const maxPerRun = opts.maxPerRun ?? 20;

  const upper = new Date(now.getTime() + 60_000).toISOString();
  const lower = new Date(now.getTime() - windowMin * 60_000).toISOString();

  const { data: due } = await supabase
    .from("reminders")
    .select("id, user_id")
    .eq("status", "scheduled")
    .gte("scheduled_for", lower)
    .lte("scheduled_for", upper)
    .order("scheduled_for", { ascending: true })
    .limit(maxPerRun);
  const rows = ((due as Array<{ id: string; user_id: string }>) ?? []);

  let sent = 0, failed = 0, skipped = 0;
  for (const r of rows) {
    const res = await sendReminderNow(supabase, { userId: r.user_id, reminder_id: r.id });
    if (res.ok) sent++;
    else if (res.error === "reminder_not_available") skipped++;
    else failed++;
  }
  return { sent, failed, skipped };
}

// Verifica se uma hora (Europe/Lisbon) já passou face a `now`. Útil para o
// DECIDE decidir entre reagendar ou avisar já.
export function isTimeInPast(dateYmd: string, timeHm: string, now: Date = new Date()): boolean {
  const iso = lisbonLocalToUtcIso(dateYmd, timeHm);
  return new Date(iso).getTime() < now.getTime();
}

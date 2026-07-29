// Ciclo proativo — o Assessor fala primeiro quando faz sentido.
// Regras determinísticas iniciais. IA não decide aqui; é hardcoded para
// evitar barulho, respeitando a Regra de Ouro.

import { sanitizeReply } from "../culture/sanitize";

export type NudgeKind =
  | "person_silence"       // pessoa com oportunidade sem contacto há N dias
  | "property_missing_docs" // imóvel activo sem documentos essenciais
  | "followup_overdue"     // follow-up vencido há > 2 dias
  | "consultant_silence";  // consultor calado há > 3 dias úteis

export interface NudgeDraft {
  kind: NudgeKind;
  subject_type: string | null;
  subject_id: string | null;
  reason: string;
  suggested_reply: string;
  dedupe_key: string;
}

function isWithinBusinessHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = Number(map.hour ?? "0");
  const wd = (map.weekday ?? "").toLowerCase();
  if (wd === "sun") return false;
  if (wd === "sat" && hour >= 13) return false;
  return hour >= 9 && hour < 20;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 864e5).toISOString();
}

function todayKey(): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return `${m.year}${m.month}${m.day}`;
}

// Gera nudges para um consultor. Não envia — devolve drafts para gravar.
export async function generateNudgesForUser(
  supabase: any,
  userId: string,
  opts: { maxPerDay?: number } = {},
): Promise<NudgeDraft[]> {
  const maxPerDay = opts.maxPerDay ?? 3;
  const drafts: NudgeDraft[] = [];

  // Quantos já foram enviados hoje.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from("assessor_nudges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "sent")
    .gte("sent_at", startOfDay.toISOString());
  if ((sentToday ?? 0) >= maxPerDay) return [];

  // 1) Pessoas silenciadas há ≥21 dias com oportunidade aberta.
  const { data: opps } = await supabase
    .from("opportunities")
    .select("id, person_id, next_action, next_action_date, updated_at")
    .eq("user_id", userId)
    .not("status", "in", "(closed_won,closed_lost,cancelled)")
    .limit(50);
  const personIds = Array.from(new Set(((opps as any[]) ?? []).map((o) => o.person_id).filter(Boolean)));
  if (personIds.length) {
    const { data: people } = await supabase
      .from("people")
      .select("id, name, updated_at")
      .in("id", personIds)
      .lt("updated_at", daysAgo(21));
    for (const p of ((people as any[]) ?? []).slice(0, 2)) {
      const dedupe = `person_silence:${p.id}:${todayKey()}`;
      drafts.push({
        kind: "person_silence",
        subject_type: "person",
        subject_id: p.id,
        reason: `Sem contacto com ${p.name} há mais de 3 semanas e há uma oportunidade aberta.`,
        suggested_reply: sanitizeReply(`Já não falas com ${p.name} há umas semanas. Queres que combine um contacto?`),
        dedupe_key: dedupe,
      });
    }
  }

  // 2) Follow-ups vencidos > 2 dias e ainda abertos.
  const { data: overdue } = await supabase
    .from("follow_ups")
    .select("id, title, due_date, status")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress", "aberto", "pendente"])
    .lt("due_date", daysAgo(2))
    .limit(3);
  for (const f of ((overdue as any[]) ?? [])) {
    const dedupe = `followup_overdue:${f.id}:${todayKey()}`;
    drafts.push({
      kind: "followup_overdue",
      subject_type: "follow_up",
      subject_id: f.id,
      reason: `Seguimento "${f.title}" já passou da data.`,
      suggested_reply: sanitizeReply(`O seguimento "${f.title}" ficou para trás. Fechamos ou remarcamos?`),
      dedupe_key: dedupe,
    });
  }

  // 3) Imóveis activos sem documentos essenciais há ≥ 7 dias.
  const { data: props } = await supabase
    .from("properties")
    .select("id, title, status, created_at")
    .eq("user_id", userId)
    .in("status", ["active", "activo", "ativo", "captacao", "angariacao"])
    .lt("created_at", daysAgo(7))
    .limit(20);
  const propIds = ((props as any[]) ?? []).map((p) => p.id);
  if (propIds.length) {
    const { data: files } = await supabase
      .from("uploaded_files")
      .select("related_resource_id, document_type")
      .eq("user_id", userId)
      .eq("related_resource_type", "property")
      .in("related_resource_id", propIds);
    const filesByProp = new Map<string, Set<string>>();
    for (const f of ((files as any[]) ?? [])) {
      const set = filesByProp.get(f.related_resource_id) ?? new Set<string>();
      if (f.document_type) set.add(String(f.document_type).toLowerCase());
      filesByProp.set(f.related_resource_id, set);
    }
    for (const p of (props as any[]).slice(0, 2)) {
      const set = filesByProp.get(p.id) ?? new Set<string>();
      const hasCaderneta = [...set].some((k) => k.includes("caderneta"));
      const hasCert = [...set].some((k) => k.includes("energ"));
      if (!hasCaderneta || !hasCert) {
        const dedupe = `property_missing_docs:${p.id}:${todayKey()}`;
        drafts.push({
          kind: "property_missing_docs",
          subject_type: "property",
          subject_id: p.id,
          reason: `Imóvel "${p.title}" continua sem ${!hasCaderneta ? "caderneta predial" : "certificado energético"}.`,
          suggested_reply: sanitizeReply(`Falta ${!hasCaderneta ? "a caderneta" : "o certificado energético"} no imóvel "${p.title}". Peço ao proprietário?`),
          dedupe_key: dedupe,
        });
      }
    }
  }

  // 4) Silêncio do consultor há ≥ 3 dias.
  const { data: lastMsg } = await supabase
    .from("assessor_messages")
    .select("created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastAt = (lastMsg as any)?.created_at ? new Date((lastMsg as any).created_at) : null;
  if (lastAt && Date.now() - lastAt.getTime() > 3 * 864e5) {
    drafts.push({
      kind: "consultant_silence",
      subject_type: null,
      subject_id: null,
      reason: "Sem mensagens do consultor há mais de 3 dias.",
      suggested_reply: "Bom dia. Queres que veja como está o teu pipeline?",
      dedupe_key: `consultant_silence:${todayKey()}`,
    });
  }

  return drafts.slice(0, maxPerDay - (sentToday ?? 0));
}

// Persiste os drafts (ignora colisões via dedupe_key) e devolve os que
// realmente entraram como pending.
export async function persistNudges(
  supabase: any,
  userId: string,
  drafts: NudgeDraft[],
): Promise<Array<NudgeDraft & { id: string }>> {
  const created: Array<NudgeDraft & { id: string }> = [];
  for (const d of drafts) {
    const { data, error } = await supabase
      .from("assessor_nudges")
      .insert({
        user_id: userId,
        kind: d.kind,
        subject_type: d.subject_type,
        subject_id: d.subject_id,
        reason: d.reason,
        suggested_reply: d.suggested_reply,
        dedupe_key: d.dedupe_key,
        status: "pending",
      } as never)
      .select("id")
      .maybeSingle();
    if (!error && data?.id) created.push({ ...d, id: data.id });
  }
  return created;
}

// Envia pending para o WhatsApp e marca como sent/dismissed.
export async function dispatchPendingNudges(
  supabase: any,
  opts: { maxPerRun?: number; now?: Date } = {},
): Promise<{ sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  if (!isWithinBusinessHours(now)) return { sent: 0, skipped: 0 };
  const maxPerRun = opts.maxPerRun ?? 20;

  const { data: pending } = await supabase
    .from("assessor_nudges")
    .select("id, user_id, suggested_reply")
    .eq("status", "pending")
    .lte("scheduled_for", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(maxPerRun);
  const rows = (pending as any[]) ?? [];
  if (!rows.length) return { sent: 0, skipped: 0 };

  // Só envia a consultores com WhatsApp ligado e v3 activa.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: profs }, { data: v3Users }] = await Promise.all([
    supabase.from("profiles").select("id, phone, whatsapp_link_status").in("id", userIds),
    supabase.from("feature_flag_users").select("user_id").eq("flag_key", "assessor.engine.v3").in("user_id", userIds),
  ]);
  const linked = new Map<string, string>();
  for (const p of ((profs as any[]) ?? [])) {
    if (p.whatsapp_link_status === "linked" && p.phone) linked.set(p.id, p.phone);
  }
  const v3Set = new Set(((v3Users as any[]) ?? []).map((u) => u.user_id));

  let sent = 0, skipped = 0;
  const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
  const { normalizePhone } = await import("@/lib/whatsapp/phone");
  for (const row of rows) {
    const phone = linked.get(row.user_id);
    if (!phone || !v3Set.has(row.user_id)) {
      await supabase.from("assessor_nudges").update({ status: "dismissed" }).eq("id", row.id);
      skipped++;
      continue;
    }
    const to = normalizePhone(phone);
    if (!to) { await supabase.from("assessor_nudges").update({ status: "dismissed" }).eq("id", row.id); skipped++; continue; }
    const r = await sendWhatsAppText(to, row.suggested_reply, { triggeredBy: row.user_id, kind: "auto" });
    if (r.ok) {
      await supabase.from("assessor_nudges").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      // Persiste no histórico do chat para o consultor ver na app.
      await supabase.from("assessor_messages").insert({
        user_id: row.user_id, channel: "whatsapp", role: "assistant",
        content: row.suggested_reply, message_type: "proactive_nudge",
      } as never);
      sent++;
    } else {
      skipped++;
    }
  }
  return { sent, skipped };
}

// Envia lembretes de follow-ups agendados pelo Assessor cuja hora chegou.
// Dedupe: só envia se ainda não existir uma mensagem `followup_reminder`
// ligada a esse follow-up.
export async function dispatchDueFollowUpReminders(
  supabase: any,
  opts: { now?: Date; windowMinutes?: number; maxPerRun?: number } = {},
): Promise<{ sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const windowMin = opts.windowMinutes ?? 10;
  const maxPerRun = opts.maxPerRun ?? 20;

  const upper = new Date(now.getTime() + 60_000).toISOString();
  const lower = new Date(now.getTime() - windowMin * 60_000).toISOString();

  const openStatuses = ["Pendente", "pending", "aberto", "in_progress", "Atrasado"];
  const { data: due } = await supabase
    .from("follow_ups")
    .select("id, user_id, title, due_date, related_prospecting_lead_id, person_id, opportunity_id")
    .in("status", openStatuses)
    .gte("due_date", lower)
    .lte("due_date", upper)
    .order("due_date", { ascending: true })
    .limit(maxPerRun);
  const rows = (due as any[]) ?? [];
  if (!rows.length) return { sent: 0, skipped: 0 };

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: profs }, { data: v3Users }, { data: already }] = await Promise.all([
    supabase.from("profiles").select("id, phone, whatsapp_link_status").in("id", userIds),
    supabase.from("feature_flag_users").select("user_id").eq("flag_key", "assessor.engine.v3").in("user_id", userIds),
    supabase.from("assessor_messages")
      .select("related_resource_id")
      .eq("message_type", "followup_reminder")
      .eq("related_resource_type", "follow_up")
      .in("related_resource_id", rows.map((r) => r.id)),
  ]);
  const linked = new Map<string, string>();
  for (const p of ((profs as any[]) ?? [])) {
    if (p.whatsapp_link_status === "linked" && p.phone) linked.set(p.id, p.phone);
  }
  const v3Set = new Set(((v3Users as any[]) ?? []).map((u) => u.user_id));
  const sentIds = new Set(((already as any[]) ?? []).map((r) => r.related_resource_id));

  const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
  const { normalizePhone } = await import("@/lib/whatsapp/phone");

  let sent = 0, skipped = 0;
  for (const fu of rows) {
    if (sentIds.has(fu.id)) { skipped++; continue; }
    const phone = linked.get(fu.user_id);
    if (!phone || !v3Set.has(fu.user_id)) { skipped++; continue; }
    const to = normalizePhone(phone);
    if (!to) { skipped++; continue; }
    const hhmm = new Intl.DateTimeFormat("pt-PT", {
      timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(fu.due_date));
    const text = sanitizeReply(`Lembrete: ${fu.title} (${hhmm}).`);
    const r = await sendWhatsAppText(to, text, { triggeredBy: fu.user_id, kind: "auto" });
    if (r.ok) {
      await supabase.from("assessor_messages").insert({
        user_id: fu.user_id, channel: "whatsapp", role: "assistant",
        content: text, message_type: "followup_reminder",
        related_resource_type: "follow_up", related_resource_id: fu.id,
      } as never);
      sent++;
    } else {
      skipped++;
    }
  }
  return { sent, skipped };
}
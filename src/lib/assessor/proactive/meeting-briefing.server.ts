// Runner da Cartela de Briefing. Corre de poucos em poucos minutos: procura
// compromissos com pessoa associada a começar nos próximos 15 minutos, monta
// o resumo rápido dessa pessoa e envia pelo canal principal.
//
// Regras não negociáveis:
// - Sem pessoa associada → não envia.
// - Sem nada relevante para dizer → não envia (nunca cartela vazia).
// - Marca `follow_ups.briefing_sent_at` → nunca duplica.

import {
  BRIEFING_GRACE_MINUTES,
  BRIEFING_LEAD_MINUTES,
  briefingTemplateParams,
  formatMeetingBriefing,
  hasBriefContent,
  isBriefingDue,
  type BriefingEvent,
} from "./meeting-briefing";

export interface BriefingRunResult {
  sent: number;
  skipped: Array<{ id: string; reason: string }>;
}

async function loadDueEvents(
  supabase: any,
  nowMs: number,
  userId?: string,
): Promise<BriefingEvent[]> {
  // Janela generosa na query (o dia inteiro à volta) porque `due_time` pode
  // sobrepor-se à hora de `due_date`; o filtro fino é feito em memória.
  const from = new Date(nowMs - 26 * 3600_000).toISOString();
  const to = new Date(nowMs + 26 * 3600_000).toISOString();
  let q = supabase
    .from("follow_ups")
    .select("id, user_id, title, type, due_date, due_time, status, person_id, briefing_sent_at")
    .is("briefing_sent_at", null)
    .not("person_id", "is", null)
    .gte("due_date", from)
    .lte("due_date", to)
    .order("due_date", { ascending: true })
    .limit(500);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  return ((data as any[]) ?? []) as BriefingEvent[];
}

/** Envia (ou não) a cartela para um compromisso concreto. */
export async function sendMeetingBriefing(
  supabase: any,
  event: BriefingEvent & { user_id: string },
  opts: { now?: Date; force?: boolean } = {},
): Promise<{ sent: boolean; reason?: string; via?: "text" | "template" }> {
  const nowMs = (opts.now ?? new Date()).getTime();
  if (!opts.force && !isBriefingDue(event, nowMs)) return { sent: false, reason: "not_due" };
  if (!event.person_id) return { sent: false, reason: "no_person" };

  const { buildPersonBrief } = await import("@/lib/assessor/v3/person-brief.server");
  const { data: person } = await supabase
    .from("people")
    .select("name")
    .eq("id", event.person_id)
    .maybeSingle();
  const personName = String((person as any)?.name ?? "").trim();
  if (!personName) return { sent: false, reason: "no_person" };

  const lookup = await buildPersonBrief({ supabase, userId: event.user_id } as any, personName);
  if (lookup.kind !== "ok") return { sent: false, reason: "no_brief" };
  if (!hasBriefContent(lookup.brief)) return { sent: false, reason: "nothing_to_say" };

  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const target = await resolveOutboundTarget(supabase, event.user_id);
  if (!target) return { sent: false, reason: "no_channel" };

  const text = formatMeetingBriefing(event, lookup.brief, nowMs);

  if (target.channel === "whatsapp") {
    const { isWithin24hWindow } = await import("./push.server");
    if (!(await isWithin24hWindow(supabase, event.user_id, "whatsapp"))) {
      // Fora da janela de 24h só passa template aprovado. O template usado é
      // o que estiver escolhido no admin; sem escolha activa, silêncio.
      const { resolveUsableBinding } = await import("@/lib/whatsapp/template-binding.server");
      const binding = await resolveUsableBinding(supabase, "meeting_briefing");
      if (!binding) return { sent: false, reason: "no_approved_template" };

      const { data: prof } = await supabase
        .from("profiles").select("name").eq("id", event.user_id).maybeSingle();
      const firstName = String((prof as any)?.name ?? "").split(" ")[0] ?? "";
      const params = briefingTemplateParams(event, lookup.brief, firstName)
        .slice(0, Math.max(0, binding.param_count));

      const { meetingBriefingTemplatePayload } = await import("./templates");
      const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
      const sentTpl = await sendWhatsAppPayload(
        target.externalId,
        meetingBriefingTemplatePayload(binding.template_name, params, binding.language),
        { kind: opts.force ? "test" : "auto" },
      );
      if (!sentTpl.ok) return { sent: false, reason: "send_failed" };
      await markBriefingSent(supabase, event, target.channel, text, nowMs);
      return { sent: true, via: "template" };
    }
  }

  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  const r = await sendReplyForChannel(target.channel, target.externalId, text);
  if (!r.ok) return { sent: false, reason: "send_failed" };

  await markBriefingSent(supabase, event, target.channel, text, nowMs);
  return { sent: true, via: "text" };
}

/** Marca já — mesmo que a corrida se repita no mesmo intervalo. */
async function markBriefingSent(
  supabase: any,
  event: BriefingEvent & { user_id: string },
  channel: string,
  text: string,
  nowMs: number,
) {
  await supabase
    .from("follow_ups")
    .update({ briefing_sent_at: new Date(nowMs).toISOString() } as never)
    .eq("id", event.id);

  await supabase.from("assessor_messages").insert({
    user_id: event.user_id,
    role: "assistant",
    content: text,
    channel,
    message_type: "meeting_briefing",
    status: "sent",
    related_resource_type: "follow_up",
    related_resource_id: event.id,
  } as never);
}

/** Corrida periódica (a cada 5 minutos). */
export async function runMeetingBriefingTick(
  supabase: any,
  opts: { now?: Date; userId?: string } = {},
): Promise<BriefingRunResult> {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const events = await loadDueEvents(supabase, nowMs, opts.userId);
  const due = events.filter((e) => isBriefingDue(e, nowMs));
  if (!due.length) return { sent: 0, skipped: [] };

  // Só contas com notificações proativas ligadas (mesmo toggle das outras).
  const userIds = Array.from(new Set(due.map((e) => (e as any).user_id)));
  const { data: prefs } = await supabase
    .from("consultant_preferences")
    .select("user_id")
    .in("user_id", userIds)
    .eq("proactive_push_enabled", true);
  const allowed = new Set(((prefs as any[]) ?? []).map((p) => p.user_id));

  const result: BriefingRunResult = { sent: 0, skipped: [] };
  for (const ev of due) {
    const uid = (ev as any).user_id as string;
    if (!allowed.has(uid)) {
      result.skipped.push({ id: ev.id, reason: "push_disabled" });
      continue;
    }
    const r = await sendMeetingBriefing(supabase, { ...ev, user_id: uid }, { now });
    if (r.sent) result.sent++;
    else result.skipped.push({ id: ev.id, reason: r.reason ?? "unknown" });
  }
  return result;
}

export { BRIEFING_LEAD_MINUTES, BRIEFING_GRACE_MINUTES };
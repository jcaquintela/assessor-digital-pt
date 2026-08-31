// Notificações proativas: push da manhã (prioridades) e check-in da tarde
// (resultado dos seguimentos). Canal: sempre o principal da conta
// (WhatsApp > Telegram).
//
// Restrição Meta: fora da janela de 24h só passa template aprovado. Enquanto
// `WHATSAPP_TEMPLATES_APPROVED` não estiver a "true", o envio fora da janela
// é saltado — dentro da janela funciona sempre (é assim que testamos).

import { computePriorities, findAwaitingOutcome } from "@/lib/assessor/supreme/priorities.server";
import { buildOutcomeCheckinPrompt } from "@/lib/assessor/interactive";
import { sanitizeReply } from "@/lib/assessor/culture/sanitize";
import { morningTemplatePayload, resolveCheckinTemplatePayload } from "./templates";
import { composeEnrichedBriefing, tightGapsFromAgenda } from "./briefing-enriched";
import { lisbonYmd, lisbonHhMm } from "@/lib/assessor/lisbon-day";

/**
 * Autorização para enviar fora da janela de 24h.
 *
 * Fonte principal: feature flag `whatsapp.templates.approved`, ligada
 * automaticamente pela corrida que consulta o estado na Meta. A variável
 * de ambiente continua a servir de interruptor manual de emergência.
 */
export async function templatesApproved(supabase?: any): Promise<boolean> {
  if (String(process.env.WHATSAPP_TEMPLATES_APPROVED ?? "").toLowerCase() === "true") return true;
  if (!supabase) return false;
  const { TEMPLATES_APPROVED_FLAG } = await import("@/lib/whatsapp/template-status.server");
  const { data } = await supabase
    .from("feature_flags")
    .select("enabled_globally")
    .eq("key", TEMPLATES_APPROVED_FLAG)
    .maybeSingle();
  return Boolean((data as any)?.enabled_globally);
}

function lisbonParts(now: Date) {
  return { date: lisbonYmd(now), hour: Number(lisbonHhMm(now).slice(0, 2)) };
}

function hourOf(time: string | null | undefined, fallback: number): number {
  const n = Number(String(time ?? "").slice(0, 2));
  return Number.isFinite(n) ? n : fallback;
}

/** Última mensagem do consultor há menos de 24h nesse canal. */
export async function isWithin24hWindow(
  supabase: any,
  userId: string,
  channel: "whatsapp" | "telegram",
): Promise<boolean> {
  const { data } = await supabase
    .from("assessor_messages")
    .select("created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = (data as any)?.created_at ? new Date((data as any).created_at) : null;
  if (!at) return false;
  return Date.now() - at.getTime() < 24 * 3600_000;
}

async function alreadySentToday(
  supabase: any,
  userId: string,
  messageType: string,
  relatedId?: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  let q = supabase
    .from("assessor_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("message_type", messageType)
    .gte("created_at", since)
    .limit(1);
  if (relatedId) q = q.eq("related_resource_id", relatedId);
  const { data } = await q;
  return Boolean(((data as any[]) ?? []).length);
}

async function logOutbound(
  supabase: any,
  userId: string,
  channel: string,
  content: string,
  messageType: string,
  related?: { type: string; id: string },
) {
  await supabase.from("assessor_messages").insert({
    user_id: userId,
    role: "assistant",
    content,
    channel,
    message_type: messageType,
    status: "sent",
    ...(related ? { related_resource_type: related.type, related_resource_id: related.id } : {}),
  } as never);
}

export interface PushUser {
  user_id: string;
  morning_time: string | null;
  evening_checkin_time: string | null;
  morning_briefing_enabled: boolean;
  evening_checkin_enabled: boolean;
}

export async function listPushUsers(supabase: any): Promise<PushUser[]> {
  const { data } = await supabase
    .from("consultant_preferences")
    .select("user_id, morning_time, evening_checkin_time, morning_briefing_enabled, evening_checkin_enabled")
    .eq("proactive_push_enabled", true);
  return ((data as any[]) ?? []) as PushUser[];
}

function formatPriorities(
  name: string,
  items: any[],
  opts: { now?: Date; dayEvents?: any[] | null } = {},
): string {
  const now = opts.now ?? new Date();
  return sanitizeReply(
    composeEnrichedBriefing(items as any, {
      firstName: name,
      now,
      tightGaps: opts.dayEvents ? tightGapsFromAgenda(opts.dayEvents as any, now) : [],
      base: "https://app.meuafonso.com",
    }),
  );
}

/** Push da manhã para um consultor. Devolve o que aconteceu (para logs/testes). */
export async function sendMorningPush(
  supabase: any,
  userId: string,
  opts: { force?: boolean } = {},
): Promise<{ sent: boolean; reason?: string }> {
  if (!opts.force && (await alreadySentToday(supabase, userId, "proactive_morning"))) {
    return { sent: false, reason: "already_sent" };
  }
  // Um único briefing por manhã, venha ele deste push ou do nudge do Supremo.
  const { morningBriefingAlreadySent } = await import("@/lib/assessor/supreme/briefing.server");
  if (!opts.force && (await morningBriefingAlreadySent(supabase, userId))) {
    return { sent: false, reason: "already_sent" };
  }
  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const target = await resolveOutboundTarget(supabase, userId);
  if (!target) return { sent: false, reason: "no_channel" };

  const priorities = await computePriorities(supabase, userId, { limit: 5 });
  const { data: prof } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
  const firstName = ((prof as any)?.name ?? "").split(" ")[0] ?? "";
  // Dia sem prioridades: enviamos na mesma (sinal de vida + sugestão), mas
  // "agenda livre" só sai depois de confirmar a agenda real do dia.
  const { emptyDaySuggestion } = await import("./empty-day");
  const { composeNoPrioritiesBriefing } = await import("./day-agenda-facts");
  const { loadDayAgendaFacts } = await import("./day-agenda-facts.server");
  const dayEvents = await loadDayAgendaFacts(supabase, userId);
  const noPrioritiesText = priorities.length
    ? ""
    : sanitizeReply(composeNoPrioritiesBriefing(firstName, dayEvents));
  const text = priorities.length
    ? formatPriorities(firstName, priorities, { dayEvents })
    : noPrioritiesText;

  const inWindow = await isWithin24hWindow(supabase, userId, target.channel);
  if (target.channel === "whatsapp" && !inWindow) {
    if (!(await templatesApproved(supabase))) return { sent: false, reason: "template_pending" };
    const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
    const lines = priorities.length
      ? priorities.map((p) => `${p.action}${p.entity_label ? ` — ${p.entity_label}` : ""}`).join("; ")
      : dayEvents.length
        ? noPrioritiesText.replace(/^Bom dia[^.]*\.\s*/, "")
        : `Agenda livre. ${emptyDaySuggestion()}`;
    const r = await sendWhatsAppPayload(
      target.externalId,
      morningTemplatePayload(firstName || "Olá", lines),
      { kind: "auto" },
    );
    if (!r.ok) return { sent: false, reason: "send_failed" };
    await logOutbound(supabase, userId, target.channel, text, "proactive_morning");
    return { sent: true };
  }

  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  const r = await sendReplyForChannel(target.channel, target.externalId, text);
  if (!r.ok) return { sent: false, reason: "send_failed" };
  await logOutbound(supabase, userId, target.channel, text, "proactive_morning");
  return { sent: true };
}

/** Check-in da tarde: botões de resultado para cada item pendente. */
export async function sendEveningCheckin(
  supabase: any,
  userId: string,
  opts: { maxItems?: number; force?: boolean } = {},
): Promise<{ sent: number; skipped: number; reason?: string }> {
  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const target = await resolveOutboundTarget(supabase, userId);
  if (!target) return { sent: 0, skipped: 0, reason: "no_channel" };

  const inWindow = await isWithin24hWindow(supabase, userId, target.channel);
  if (target.channel === "whatsapp" && !inWindow && !(await templatesApproved(supabase))) {
    return { sent: 0, skipped: 0, reason: "template_pending" };
  }

  const items = (await findAwaitingOutcome(supabase, userId)).slice(0, opts.maxItems ?? 3);
  if (!items.length) return { sent: 0, skipped: 0, reason: "nothing_awaiting" };

  let sent = 0, skipped = 0;
  for (const item of items) {
    if (!opts.force && (await alreadySentToday(supabase, userId, "outcome_checkin", item.id))) {
      skipped++;
      continue;
    }
    const prompt = buildOutcomeCheckinPrompt(item);
    let ok = false;
    if (target.channel === "whatsapp") {
      if (inWindow) {
        const { sendWhatsAppInteractive } = await import("@/lib/whatsapp/interactive.server");
        ok = (await sendWhatsAppInteractive(target.externalId, prompt, { kind: "auto" })).ok;
      } else {
        // Fora das 24h só passa template aprovado (botões vêm do próprio template).
        // Usa a versão corrigida (v2) se já estiver aprovada; senão mantém a antiga.
        const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
        const { isCheckinV2Approved } = await import("@/lib/whatsapp/template-status.server");
        const checkinPayload = await resolveCheckinTemplatePayload(item.title, isCheckinV2Approved);
        ok = (
          await sendWhatsAppPayload(target.externalId, checkinPayload, { kind: "auto" })
        ).ok;
      }
    } else {
      const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
      const r = await getTelegramProvider().sendOptions({
        chatId: target.externalId,
        text: prompt.body,
        options: prompt.options.map((o) => ({ label: o.label, callbackData: o.id })),
      });
      ok = r.ok;
    }
    if (!ok) { skipped++; continue; }
    await logOutbound(supabase, userId, target.channel, prompt.body, "outcome_checkin", {
      type: "follow_up", id: item.id,
    });
    sent++;
  }
  return { sent, skipped };
}

/** Corrida horária: decide quem recebe o quê nesta hora (Europe/Lisbon). */
export async function runProactivePushTick(
  supabase: any,
  opts: { now?: Date } = {},
): Promise<{ morning: number; checkins: number; users: number }> {
  const now = opts.now ?? new Date();
  const { hour } = lisbonParts(now);
  const users = await listPushUsers(supabase);
  let morning = 0, checkins = 0;
  for (const u of users) {
    if (u.morning_briefing_enabled !== false && hour === hourOf(u.morning_time, 8)) {
      const r = await sendMorningPush(supabase, u.user_id);
      if (r.sent) morning++;
    }
    if (u.evening_checkin_enabled !== false && hour === hourOf(u.evening_checkin_time, 18)) {
      const r = await sendEveningCheckin(supabase, u.user_id);
      checkins += r.sent;
    }
  }
  return { morning, checkins, users: users.length };
}
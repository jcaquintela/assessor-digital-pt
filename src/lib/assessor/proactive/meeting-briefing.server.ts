// Runner da Cartela de Briefing. Corre de poucos em poucos minutos: procura
// compromissos com pessoa associada a começar nos próximos 30 minutos, monta
// o resumo rápido dessa pessoa e envia pelo canal principal.
//
// Regras não negociáveis:
// - Sem pessoa associada → não envia.
// - Sem nada relevante para dizer → não envia (nunca cartela vazia).
// - Marca `follow_ups.briefing_sent_at` → nunca duplica.
// - Compromissos a menos de 45 min uns dos outros → UMA cartela conjunta.

import {
  BRIEFING_GRACE_MINUTES,
  BRIEFING_LEAD_MINUTES,
  briefingTemplateParams,
  formatJointBriefing,
  groupNearbyEvents,
  hasAnyBriefingContent,
  isBriefingEligible,
  isBriefingDue,
  type BriefingEvent,
  type BriefingPart,
  type BriefingPendings,
  type EventBriefContext,
} from "./meeting-briefing";


/** Imóvel e negócio ligados ao próprio compromisso (não à pessoa). */
async function loadEventContext(
  supabase: any,
  event: BriefingEvent & { user_id: string },
): Promise<EventBriefContext> {
  const ctx: EventBriefContext = {};
  if (event.related_property_id) {
    const { data } = await supabase
      .from("properties")
      .select("title, address, typology, asking_price")
      .eq("id", event.related_property_id)
      .eq("user_id", event.user_id)
      .maybeSingle();
    if (data) {
      ctx.property = {
        title: (data as any).title ?? null,
        address: (data as any).address ?? null,
        typology: (data as any).typology ?? null,
        price: (data as any).asking_price ?? null,
      };
    }
  }
  if (event.opportunity_id) {
    const { data } = await supabase
      .from("opportunities")
      .select("title, type, stage")
      .eq("id", event.opportunity_id)
      .eq("user_id", event.user_id)
      .maybeSingle();
    if (data) {
      ctx.deal = {
        label: (data as any).title ?? (data as any).type ?? "negócio",
        stage: (data as any).stage ?? null,
      };
    }
  }
  return ctx;
}

/**
 * Pendências do mesmo compromisso: rascunho de email por enviar (pessoa),
 * documento essencial em falta (imóvel) e prazo próximo (negócio). Tudo
 * reaproveitado de mecanismos já existentes — nada de novo a inventar.
 * Falhar aqui nunca pode impedir a cartela.
 */
export async function loadBriefingPendings(
  supabase: any,
  event: BriefingEvent & { user_id: string },
  nowMs: number,
): Promise<BriefingPendings> {
  const out: BriefingPendings = {};

  if (event.person_id) {
    try {
      const { data } = await supabase
        .from("email_drafts")
        .select("subject, status, sent_at, person_id")
        .eq("user_id", event.user_id)
        .eq("person_id", event.person_id)
        .eq("status", "pending")
        .is("sent_at", null)
        .limit(3);
      const rows = ((data as any[]) ?? []).filter((r) => !r?.sent_at);
      if (rows.length) {
        out.emailDrafts = rows.map((r) => String(r.subject ?? "").trim() || "rascunho sem assunto");
      }
    } catch { /* sem rascunhos, a cartela segue */ }
  }

  if (event.related_property_id) {
    try {
      const { data } = await supabase
        .from("uploaded_files")
        .select("document_type")
        .eq("user_id", event.user_id)
        .eq("related_resource_type", "property")
        .eq("related_resource_id", event.related_property_id)
        .limit(100);
      const kinds = ((data as any[]) ?? [])
        .map((f) => String(f?.document_type ?? "").toLowerCase())
        .filter(Boolean);
      const missing: string[] = [];
      if (!kinds.some((k) => k.includes("caderneta"))) missing.push("caderneta predial");
      if (!kinds.some((k) => k.includes("energ"))) missing.push("certificado energético");
      if (missing.length) out.missingDocs = missing;
    } catch { /* sem ficheiros, não se afirma nada */ }
  }

  if (event.opportunity_id) {
    try {
      const { lisbonYmd } = await import("@/lib/assessor/lisbon-day");
      const { daysUntilDeadline, deadlineWhen, isDeadlineOpen, isInNoticeWindow, noticeDaysOf } =
        await import("@/lib/deals/deadlines");
      const { data } = await supabase
        .from("deal_deadlines")
        .select("label, due_date, status, notice_days, archived_at")
        .eq("user_id", event.user_id)
        .eq("opportunity_id", event.opportunity_id)
        .is("archived_at", null)
        .order("due_date", { ascending: true })
        .limit(10);
      const today = lisbonYmd(nowMs);
      const lines: string[] = [];
      for (const row of ((data as any[]) ?? [])) {
        if (!isDeadlineOpen(row)) continue;
        const left = daysUntilDeadline(String(row.due_date), today);
        if (!isInNoticeWindow(left, noticeDaysOf(row))) continue;
        lines.push(`${String(row.label ?? "prazo").trim()} — ${deadlineWhen(left)}`);
      }
      if (lines.length) out.deadlines = lines.slice(0, 3);
    } catch { /* prazos são bónus */ }
  }

  return out;
}


export interface BriefingRunResult {
  sent: number;
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * Reserva atómica do envio: marca `briefing_sent_at` ANTES de enviar, e só
 * quando ainda estava vazio. Se outra corrida (ou uma reexecução do runner,
 * ou uma alteração do evento em cima da hora) já reservou, esta devolve
 * false e ninguém envia duas vezes.
 */
async function claimBriefing(
  supabase: any,
  eventId: string,
  nowMs: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("follow_ups")
    .update({ briefing_sent_at: new Date(nowMs).toISOString() } as never)
    .eq("id", eventId)
    .is("briefing_sent_at", null)
    .select("id");
  if (error) return false;
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

/** Devolve a reserva quando o envio falha, para tentar de novo na corrida seguinte. */
async function releaseBriefingClaim(supabase: any, eventId: string) {
  await supabase
    .from("follow_ups")
    .update({ briefing_sent_at: null } as never)
    .eq("id", eventId);
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
    .select(
      "id, user_id, title, type, due_date, due_time, status, person_id, related_property_id, " +
      "opportunity_id, related_prospecting_lead_id, event_class, created_at, briefing_sent_at",
    )
    .is("briefing_sent_at", null)
    .or("event_class.is.null,event_class.neq.interno")
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
  opts: {
    now?: Date;
    force?: boolean;
    forceTemplate?: boolean;
    markSent?: boolean;
    testId?: string | null;
    /** Compromissos seguidos (<45 min) que entram na mesma cartela. */
    companions?: Array<BriefingEvent & { user_id: string }>;
  } = {},

): Promise<{
  sent: boolean;
  reason?: string;
  via?: "text" | "template";
  logId?: string | null;
  messageId?: string | null;
  templateName?: string | null;
  templateCategory?: string | null;
  hoursSinceLastInbound?: number | null;
  outsideWindow?: boolean | null;
  costEur?: number | null;
}> {
  const nowMs = (opts.now ?? new Date()).getTime();
  if (!opts.force && !isBriefingDue(event, nowMs)) return { sent: false, reason: "not_due" };
  if (!opts.force && !isBriefingEligible(event)) {
    return { sent: false, reason: "not_business_event" };
  }

  // Idempotência: reserva antes de qualquer envio. Testes do admin
  // (`markSent: false`) e disparos forçados não reservam.
  const claims = opts.markSent !== false && !opts.force;
  const claimedIds: string[] = [];
  if (claims) {
    const claimed = await claimBriefing(supabase, event.id, nowMs);
    if (!claimed) return { sent: false, reason: "already_sent" };
    claimedIds.push(event.id);
  }
  const companions: Array<BriefingEvent & { user_id: string }> = [];
  for (const c of opts.companions ?? []) {
    if (claims) {
      const ok = await claimBriefing(supabase, c.id, nowMs);
      if (!ok) continue;
      claimedIds.push(c.id);
    }
    companions.push(c);
  }
  const abort = async (reason: string, extra: Record<string, unknown> = {}) => {
    for (const id of claimedIds) await releaseBriefingClaim(supabase, id);
    return { sent: false as const, reason, ...extra };
  };

  const buildPart = async (
    ev: BriefingEvent & { user_id: string },
  ): Promise<BriefingPart> => {
    let b: any = null;
    if (ev.person_id) {
      const { buildPersonBrief } = await import("@/lib/assessor/v3/person-brief.server");
      const { data: person } = await supabase
        .from("people")
        .select("name")
        .eq("id", ev.person_id)
        .maybeSingle();
      const personName = String((person as any)?.name ?? "").trim();
      if (personName) {
        const lookup = await buildPersonBrief({ supabase, userId: ev.user_id } as any, personName);
        if (lookup.kind === "ok") b = lookup.brief;
      }
    }
    const ctx = await loadEventContext(supabase, ev);
    let pendings: BriefingPendings = {};
    try { pendings = await loadBriefingPendings(supabase, ev, nowMs); } catch { /* bónus */ }
    return { event: ev, brief: b, ctx, pendings };
  };

  const mainPart = await buildPart(event);
  const brief = mainPart.brief;
  const eventCtx = mainPart.ctx as EventBriefContext | null;
  const pendings = mainPart.pendings ?? null;
  const parts: BriefingPart[] = [mainPart];
  for (const c of companions) parts.push(await buildPart(c));

  const anyContent = parts.some((p) => hasAnyBriefingContent(p.brief, p.ctx, p.pendings));
  if (!anyContent) return abort("nothing_to_say");


  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const target = await resolveOutboundTarget(supabase, event.user_id);
  if (!target) return abort("no_channel");

  const text = formatJointBriefing(parts, nowMs);


  if (target.channel === "whatsapp") {
    const { isWithin24hWindow } = await import("./push.server");
    const within = await isWithin24hWindow(supabase, event.user_id, "whatsapp");
    if (opts.forceTemplate || !within) {
      // Fora da janela de 24h só passa template aprovado. O template usado é
      // o que estiver escolhido no admin; sem escolha activa, silêncio.
      const { resolveUsableBinding } = await import("@/lib/whatsapp/template-binding.server");
      const binding = await resolveUsableBinding(supabase, "meeting_briefing");
      if (!binding) {
        // Falha segura: nunca silêncio. Telegram ligado na mesma conta →
        // entrega por lá; sem Telegram → o problema fica visível no admin.
        const fb = await deliverBriefingFallback(supabase, event.user_id, text);
        if (!fb.delivered) return abort("no_approved_template");
        if (opts.markSent !== false) await markBriefingSent(supabase, event, "telegram", text, nowMs);
        return { sent: true, via: "text" };
      }

      const { data: prof } = await supabase
        .from("profiles").select("name").eq("id", event.user_id).maybeSingle();
      const firstName = String((prof as any)?.name ?? "").split(" ")[0] ?? "";
      const params = briefingTemplateParams(
        event, brief, firstName, eventCtx, pendings, parts.slice(1),
      ).slice(0, Math.max(0, binding.param_count));


      const { meetingBriefingTemplatePayload } = await import("./templates");
      const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
      const { hoursSinceLastInbound } = await import("@/lib/whatsapp/pricing.server");
      const silentHours = await hoursSinceLastInbound(supabase, event.user_id, "whatsapp");
      const sentTpl = await sendWhatsAppPayload(
        target.externalId,
        meetingBriefingTemplatePayload(binding.template_name, params, binding.language),
        {
          kind: opts.force ? "test" : "auto",
          meta: {
            purpose: "meeting_briefing",
            templateName: binding.template_name,
            templateCategory: binding.category ?? null,
            templateLanguage: binding.language,
            // Fora da janela a sério (não apenas forçado no teste).
            outsideWindow: !within,
            hoursSinceLastInbound: silentHours,
            testId: opts.testId ?? null,
          },
        },
      );
      const common = {
        logId: sentTpl.logId ?? null,
        messageId: sentTpl.ok ? sentTpl.messageId : null,
        templateName: binding.template_name,
        templateCategory: binding.category ?? null,
        hoursSinceLastInbound: silentHours,
        outsideWindow: !within,
      };
      if (!sentTpl.ok) return await abort("send_failed", common);
      if (opts.markSent !== false) await markBriefingSent(supabase, event, target.channel, text, nowMs);
      return { sent: true, via: "template", ...common };
    }
  }

  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  const r = await sendReplyForChannel(target.channel, target.externalId, text);
  if (!r.ok) return abort("send_failed");

  if (opts.markSent !== false) await markBriefingSent(supabase, event, target.channel, text, nowMs);
  return { sent: true, via: "text" };
}

/** Confirma a marca (a reserva já a pôs) e regista a mensagem enviada. */
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

  // Anti-sobreposição: compromissos elegíveis a menos de 45 min uns dos
  // outros formam UMA cartela conjunta — a preparação do segundo nunca
  // chega a meio do primeiro. Só entram no grupo eventos ainda elegíveis.
  const dueIds = new Set(due.map((e) => e.id));
  const groupable = events.filter(
    (e) => dueIds.has(e.id) || (isBriefingEligible(e) && !(e as any).briefing_sent_at),
  );
  const groups = groupNearbyEvents(groupable as any[])
    .map((g) => g.filter((e) => dueIds.has(e.id) || g.some((x) => dueIds.has(x.id))))
    .filter((g) => g.some((e) => dueIds.has(e.id)));

  for (const group of groups) {
    const [head, ...rest] = group;
    if (!head) continue;
    const uid = (head as any).user_id as string;
    if (!allowed.has(uid)) {
      for (const ev of group) result.skipped.push({ id: ev.id, reason: "push_disabled" });
      continue;
    }
    const companions = rest.map((e) => ({ ...(e as any), user_id: uid }));
    const r = await sendMeetingBriefing(
      supabase,
      { ...(head as any), user_id: uid },
      { now, companions },
    );
    if (r.sent) result.sent++;
    else result.skipped.push({ id: head.id, reason: r.reason ?? "unknown" });
  }
  return result;
}


export { BRIEFING_LEAD_MINUTES, BRIEFING_GRACE_MINUTES };
/**
 * Falha segura de canal: o template de briefing não está aprovado/activo.
 * Nunca cair em silêncio — se a mesma conta tiver Telegram ligado, entrega
 * por lá; caso contrário, regista o problema em `admin_audit_logs` para
 * ficar visível no admin.
 */
export async function deliverBriefingFallback(
  supabase: any,
  userId: string,
  text: string,
): Promise<{ delivered: boolean; via?: "telegram" }> {
  let telegramId: string | null = null;
  try {
    const { loadChannelAvailability } = await import("@/lib/assessor/primary-channel.server");
    const av = await loadChannelAvailability(supabase, userId);
    telegramId = av.telegram ?? null;
  } catch { telegramId = null; }

  if (telegramId) {
    try {
      const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
      const r = await sendReplyForChannel("telegram", telegramId, text);
      if (r?.ok) return { delivered: true, via: "telegram" };
    } catch { /* cai no registo abaixo */ }
  }

  try {
    await supabase.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: "briefing.template_unavailable",
      target_user_id: userId,
      resource_type: "profile",
      resource_id: userId,
      reason: "Cartela de briefing fora da janela de 24h sem template WhatsApp aprovado/activo.",
      metadata: {
        source: "meeting-briefing",
        had_telegram_fallback: Boolean(telegramId),
        preview: String(text ?? "").slice(0, 300),
      },
    } as never);
  } catch { /* registo é bónus, nunca rebenta o runner */ }

  return { delivered: false };
}

// Runner do Guião de Objeções. Corre de 5 em 5 minutos: procura reuniões de
// angariação a começar nos próximos 10 minutos e manda o guião sozinho.
//
// Regras:
// - Só reuniões de angariação (título/tipo/notas).
// - Marca `follow_ups.objection_guide_sent_at` → nunca duplica.
// - Respeita o mesmo toggle de notificações proativas das outras.

import {
  GUIDE_GRACE_MINUTES,
  GUIDE_LEAD_MINUTES,
  formatObjectionGuide,
  isGuideDue,
  type GuideContext,
  type GuideEvent,
} from "./objection-guide";

export interface GuideRunResult {
  sent: number;
  skipped: Array<{ id: string; reason: string }>;
}

const SELECT =
  "id, user_id, title, type, notes, due_date, due_time, status, person_id, related_property_id, objection_guide_sent_at";

async function loadDueEvents(supabase: any, nowMs: number, userId?: string): Promise<GuideEvent[]> {
  const from = new Date(nowMs - 26 * 3600_000).toISOString();
  const to = new Date(nowMs + 26 * 3600_000).toISOString();
  let q = supabase
    .from("follow_ups")
    .select(SELECT)
    .is("objection_guide_sent_at", null)
    .gte("due_date", from)
    .lte("due_date", to)
    .order("due_date", { ascending: true })
    .limit(500);
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  return ((data as any[]) ?? []) as GuideEvent[];
}

/** Contexto real da pessoa/imóvel ligados ao compromisso. */
async function loadGuideContext(
  supabase: any,
  ev: GuideEvent & { user_id: string },
): Promise<GuideContext> {
  const ctx: GuideContext = {};

  if (ev.person_id) {
    const { data: person } = await supabase
      .from("people").select("name").eq("id", ev.person_id).maybeSingle();
    ctx.personName = ((person as any)?.name ?? null) as string | null;

    const { data: inter } = await supabase
      .from("interactions")
      .select("summary, original_content")
      .eq("user_id", ev.user_id)
      .eq("person_id", ev.person_id)
      .order("occurred_at", { ascending: false })
      .limit(1);
    const row = ((inter as any[]) ?? [])[0];
    const text = String(row?.summary ?? row?.original_content ?? "").trim();
    if (text) ctx.lastInteraction = text.slice(0, 220);
  }

  let property: any = null;
  if (ev.related_property_id) {
    const { data } = await supabase
      .from("properties").select("title, asking_price").eq("id", ev.related_property_id).maybeSingle();
    property = data;
  } else if (ev.person_id) {
    const { data } = await supabase
      .from("properties")
      .select("title, asking_price")
      .eq("user_id", ev.user_id)
      .eq("owner_person_id", ev.person_id)
      .order("updated_at", { ascending: false })
      .limit(1);
    property = ((data as any[]) ?? [])[0] ?? null;
  }
  if (property) {
    ctx.propertyTitle = (property.title ?? null) as string | null;
    ctx.askingPrice = (property.asking_price ?? null) as number | null;
  }

  return ctx;
}

/** Envia (ou não) o guião para um compromisso concreto. */
export async function sendObjectionGuide(
  supabase: any,
  event: GuideEvent & { user_id: string },
  opts: { now?: Date; force?: boolean; markSent?: boolean } = {},
): Promise<{ sent: boolean; reason?: string; text?: string }> {
  const nowMs = (opts.now ?? new Date()).getTime();
  if (!opts.force && !isGuideDue(event, nowMs)) return { sent: false, reason: "not_due" };

  const ctx = await loadGuideContext(supabase, event);
  const text = formatObjectionGuide(event, ctx, nowMs);

  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const target = await resolveOutboundTarget(supabase, event.user_id);
  if (!target) return { sent: false, reason: "no_channel", text };

  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  const r = await sendReplyForChannel(target.channel, target.externalId, text);
  if (!r.ok) return { sent: false, reason: "send_failed", text };

  if (opts.markSent !== false) {
    await supabase
      .from("follow_ups")
      .update({ objection_guide_sent_at: new Date(nowMs).toISOString() } as never)
      .eq("id", event.id);

    await supabase.from("assessor_messages").insert({
      user_id: event.user_id,
      role: "assistant",
      content: text,
      channel: target.channel,
      message_type: "objection_guide",
      status: "sent",
      related_resource_type: "follow_up",
      related_resource_id: event.id,
    } as never);
  }
  return { sent: true, text };
}

/** Corrida periódica (a cada 5 minutos). */
export async function runObjectionGuideTick(
  supabase: any,
  opts: { now?: Date; userId?: string } = {},
): Promise<GuideRunResult> {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const events = await loadDueEvents(supabase, nowMs, opts.userId);
  const due = events.filter((e) => isGuideDue(e, nowMs));
  if (!due.length) return { sent: 0, skipped: [] };

  const userIds = Array.from(new Set(due.map((e) => (e as any).user_id)));
  const { data: prefs } = await supabase
    .from("consultant_preferences")
    .select("user_id")
    .in("user_id", userIds)
    .eq("proactive_push_enabled", true);
  const allowed = new Set(((prefs as any[]) ?? []).map((p) => p.user_id));

  const result: GuideRunResult = { sent: 0, skipped: [] };
  for (const ev of due) {
    const uid = (ev as any).user_id as string;
    if (!allowed.has(uid)) {
      result.skipped.push({ id: ev.id, reason: "push_disabled" });
      continue;
    }
    const r = await sendObjectionGuide(supabase, { ...ev, user_id: uid }, { now });
    if (r.sent) result.sent++;
    else result.skipped.push({ id: ev.id, reason: r.reason ?? "unknown" });
  }
  return result;
}

export { GUIDE_LEAD_MINUTES, GUIDE_GRACE_MINUTES };
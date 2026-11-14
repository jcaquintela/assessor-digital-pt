// Envio individual de convites do piloto (desligado por interruptor).
// Nunca grava nem regista o código: só existe na mensagem enviada.
// Vaga, validade, uso único, teto e permissão: `issue_pilot_invite` na base.

import { isAccountFlagEnabled } from "@/lib/flags/account-flag.server";
import { PILOT_KEY } from "./pilot";
import { canManagePilotInvites, issuePilotInvite, revokePilotInvite } from "./pilot-access.server";
import {
  channelPermission, deliveryRetryVerdict, maskExternalId, nextDeliveryStatus, pilotInviteDeliveryText,
  PILOT_INVITE_DELIVERY_FLAG, PILOT_INVITE_TEMPLATE_SETTING,
  type DeliveryChannel, type DeliveryOutcome,
} from "./invite-delivery";

export type SendResult = { ok: boolean; providerMessageId?: string | null; errorCode?: string | null };
export type DeliveryDeps = {
  sendWhatsAppText?: (to: string, text: string) => Promise<SendResult>;
  sendWhatsAppTemplate?: (to: string, template: string, params: string[]) => Promise<SendResult>;
  sendTelegramText?: (chatId: string, text: string) => Promise<SendResult>;
  now?: () => number;
};

async function defaultDeps(): Promise<Required<Omit<DeliveryDeps, "now">>> {
  return {
    async sendWhatsAppText(to, text) {
      const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
      const r: any = await sendWhatsAppText(to, text, { kind: "auto", meta: { purpose: "pilot_invite" } as any });
      return { ok: !!r?.ok, providerMessageId: r?.messageId ?? null, errorCode: r?.ok ? null : String(r?.telemetry?.errorCode ?? r?.error ?? "send_failed") };
    },
    async sendWhatsAppTemplate(to, template, params) {
      const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
      const r: any = await sendWhatsAppPayload(to, {
        type: "template",
        template: { name: template, language: { code: "pt_PT" },
          components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
      }, { kind: "auto", meta: { purpose: "pilot_invite", templateName: template, templateCategory: "UTILITY", outsideWindow: true } as any });
      return { ok: !!r?.ok, providerMessageId: r?.messageId ?? null, errorCode: r?.ok ? null : String(r?.telemetry?.errorCode ?? "send_failed") };
    },
    async sendTelegramText(chatId, text) {
      const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
      const r = await getTelegramProvider().sendText({ chatId, text });
      return { ok: r.ok, providerMessageId: r.messageId ? String(r.messageId) : null, errorCode: r.ok ? null : String(r.error ?? "send_failed") };
    },
  };
}

type Facts = { name: string | null; externalId: string | null; lastInboundAtMs: number | null; optIns: string[]; templateName: string | null };

async function loadFacts(sa: any, userId: string, channel: DeliveryChannel): Promise<Facts> {
  const { loadChannelAvailability } = await import("@/lib/assessor/primary-channel.server");
  const [av, prof, prefs, lastIn, tpl] = await Promise.all([
    loadChannelAvailability(sa, userId),
    sa.from("profiles").select("name").eq("id", userId).maybeSingle(),
    sa.from("consultant_preferences").select("explicit_opt_ins").eq("user_id", userId).maybeSingle(),
    sa.from("assessor_messages").select("created_at").eq("user_id", userId).eq("channel", channel).eq("role", "user")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sa.from("app_settings").select("value").eq("key", PILOT_INVITE_TEMPLATE_SETTING).maybeSingle(),
  ]);
  const tv = (tpl as any)?.data?.value;
  return {
    name: (prof as any)?.data?.name ?? null,
    externalId: channel === "whatsapp" ? av.whatsapp : av.telegram,
    lastInboundAtMs: (lastIn as any)?.data?.created_at ? new Date((lastIn as any).data.created_at).getTime() : null,
    optIns: Array.isArray((prefs as any)?.data?.explicit_opt_ins) ? (prefs as any).data.explicit_opt_ins : [],
    templateName: typeof tv === "string" ? tv : (tv?.name ?? null),
  };
}

async function eligibility(sa: any, userId: string, pilotKey: string): Promise<"ok" | "not_eligible" | "already_participant"> {
  const [acc, part] = await Promise.all([
    sa.from("account_access").select("state").eq("user_id", userId).maybeSingle(),
    sa.from("pilot_participants").select("status").eq("pilot_key", pilotKey).eq("user_id", userId).maybeSingle(),
  ]);
  if ((part as any)?.data) return "already_participant"; // inclui excluídos (ex.: Telmo): nunca recebem
  const st = (acc as any)?.data?.state;
  return st === "registered_waiting" || st === "invited" ? "ok" : "not_eligible";
}

/** Pré-visualização para a confirmação na administração (contacto mascarado). */
export async function previewPilotInviteDelivery(sa: any, p: { actor: string; recipientUserId: string; channel: DeliveryChannel }, pilotKey = PILOT_KEY) {
  const enabled = await isAccountFlagEnabled(sa, PILOT_INVITE_DELIVERY_FLAG, null);
  const elig = await eligibility(sa, p.recipientUserId, pilotKey);
  const f = await loadFacts(sa, p.recipientUserId, p.channel);
  const perm = channelPermission({ channel: p.channel, ...f });
  return {
    enabled,
    canManage: await canManagePilotInvites(sa, p.actor, pilotKey),
    eligibility: elig,
    recipientName: f.name ?? "—",
    destination: maskExternalId(p.channel, f.externalId),
    channelOk: perm.ok,
    channelProblem: perm.ok ? null : perm.outcome,
    mode: perm.ok ? perm.mode : null,
  };
}

export async function sendPilotInvite(
  sa: any,
  p: { actor: string; recipientUserId: string; channel: DeliveryChannel; confirm: { recipientUserId: string; channel: string } },
  deps: DeliveryDeps = {},
  pilotKey = PILOT_KEY,
): Promise<{ outcome: DeliveryOutcome; deliveryId?: string }> {
  const now = deps.now ?? Date.now;
  if (p.confirm.recipientUserId !== p.recipientUserId || p.confirm.channel !== p.channel) return { outcome: "confirm_mismatch" };
  if (!(await isAccountFlagEnabled(sa, PILOT_INVITE_DELIVERY_FLAG, null))) return { outcome: "disabled" };
  if (!(await canManagePilotInvites(sa, p.actor, pilotKey))) return { outcome: "forbidden" };
  const elig = await eligibility(sa, p.recipientUserId, pilotKey);
  if (elig !== "ok") return { outcome: elig };
  const facts = await loadFacts(sa, p.recipientUserId, p.channel);
  const perm = channelPermission({ channel: p.channel, ...facts }, now());
  if (!perm.ok) return { outcome: perm.outcome };

  // 1. Reserva do envio por pessoa (um registo por pessoa e piloto).
  const nowIso = new Date(now()).toISOString();
  let delivery: { id: string; attempts: number; invite_id: string | null } | null = null;
  const readExisting = () => sa.from("pilot_invite_deliveries")
    .select("id, status, attempts, invite_id, last_attempt_at").eq("pilot_key", pilotKey).eq("recipient_user_id", p.recipientUserId).maybeSingle();
  let { data: existing } = await readExisting();
  if (!existing) {
    const ins = await sa.from("pilot_invite_deliveries").insert({
      pilot_key: pilotKey, recipient_user_id: p.recipientUserId, channel: p.channel,
      status: "issuing", requested_by: p.actor, last_attempt_at: nowIso, attempts: 1,
    } as never).select("id, attempts, invite_id").maybeSingle();
    if (!ins.error && ins.data) delivery = ins.data as any;
    else if (/duplicate|unique|23505/i.test(`${ins.error?.code ?? ""} ${ins.error?.message ?? ""}`)) existing = (await readExisting()).data;
    else return { outcome: "error" };
  }
  if (!delivery) {
    const row: any = existing;
    if (!row) return { outcome: "error" };
    let inv: any = null;
    if (row.invite_id) inv = (await sa.from("access_invites").select("status, expires_at").eq("id", row.invite_id).maybeSingle()).data;
    const v = deliveryRetryVerdict({ ...row, invite_status: inv?.status ?? null, invite_expires_at: inv?.expires_at ?? null }, now());
    if (v !== "retry") return { outcome: v, deliveryId: row.id };
    // Reabertura condicional: só uma tentativa concorrente ganha.
    const { data: reopened } = await sa.from("pilot_invite_deliveries")
      .update({ status: "issuing", attempts: row.attempts + 1, last_attempt_at: nowIso, channel: p.channel,
        requested_by: p.actor, error_code: null, error_reason: null, provider_message_id: null } as never)
      .eq("id", row.id).eq("status", row.status).eq("attempts", row.attempts).select("id, attempts, invite_id");
    if (!reopened || reopened.length === 0) return { outcome: "in_flight", deliveryId: row.id };
    delivery = reopened[0];
    // Convite anterior ainda ativo (tentativa interrompida): anula-o para não ocupar duas vagas.
    if (inv?.status === "issued" && row.invite_id) await revokePilotInvite(sa, { actor: p.actor, inviteId: row.invite_id }, pilotKey);
  }
  const d = delivery!;
  const mark = (patch: Record<string, unknown>) => sa.from("pilot_invite_deliveries").update(patch as never).eq("id", d.id);

  // 2. Emissão pelo caminho único (mesma vaga para a mesma tentativa).
  const issued = await issuePilotInvite(sa, {
    issuer: p.actor, idempotencyKey: `delivery:${d.id}:${d.attempts}`, note: "envio direto", via: `admin:send:${p.channel}`,
  }, pilotKey);
  if (issued.outcome !== "issued" || !issued.code) {
    const outcome: DeliveryOutcome = issued.outcome === "cap_reached" ? "cap_reached" : issued.outcome === "not_open" ? "not_open" : "error";
    await mark({ status: "blocked", error_reason: outcome });
    return { outcome, deliveryId: d.id };
  }
  const { data: invRow } = await sa.from("access_invites").select("id").eq("idempotency_key", `delivery:${d.id}:${d.attempts}`).eq("issuer_user_id", p.actor).maybeSingle();
  const inviteId = (invRow as any)?.id ?? null;
  await mark({ invite_id: inviteId });

  // 3. Envio. O código só vive aqui; nada o grava.
  const full = { ...(await defaultDeps()), ...deps };
  let r: SendResult;
  try {
    if (p.channel === "telegram") r = await full.sendTelegramText(facts.externalId!, pilotInviteDeliveryText(facts.name, issued.code, issued.ttlDays));
    else if (perm.mode === "template") r = await full.sendWhatsAppTemplate(facts.externalId!, facts.templateName!, [issued.code, String(issued.ttlDays)]);
    else r = await full.sendWhatsAppText(facts.externalId!, pilotInviteDeliveryText(facts.name, issued.code, issued.ttlDays));
  } catch {
    r = { ok: false, errorCode: "exception" };
  }

  if (!r.ok) {
    // O código não chegou: anula o convite e liberta a vaga.
    if (inviteId) await revokePilotInvite(sa, { actor: p.actor, inviteId }, pilotKey);
    await mark({ status: "failed", error_code: String(r.errorCode ?? "send_failed").slice(0, 64), error_reason: "send_failed" });
    return { outcome: "send_failed", deliveryId: d.id };
  }
  const status = p.channel === "telegram" ? "sent" : "accepted";
  await mark({ status, provider_message_id: r.providerMessageId ?? null });
  return { outcome: status, deliveryId: d.id };
}

/** Estados vindos do WhatsApp (sent/delivered/read/failed). Nunca recua. */
export async function applyPilotDeliveryStatus(sa: any, providerMessageId: string, incoming: string, errorCode?: string | null): Promise<boolean> {
  const { data: row } = await sa.from("pilot_invite_deliveries")
    .select("id, status, invite_id, requested_by, pilot_key").eq("provider_message_id", providerMessageId).maybeSingle();
  if (!row) return false;
  const next = nextDeliveryStatus((row as any).status, incoming);
  if (!next) return false;
  const { data: upd } = await sa.from("pilot_invite_deliveries")
    .update({ status: next, ...(next === "failed" ? { error_code: errorCode ? String(errorCode).slice(0, 64) : null, error_reason: "provider_failed" } : {}) } as never)
    .eq("id", (row as any).id).eq("status", (row as any).status).select("id");
  if (!upd || upd.length === 0) return false;
  if (next === "failed" && (row as any).invite_id) {
    await revokePilotInvite(sa, { actor: (row as any).requested_by, inviteId: (row as any).invite_id }, (row as any).pilot_key);
  }
  return true;
}

// Aviso ao consultor quando o plano sobe de 'base' para um plano pago.
//
// Vale para qualquer origem: código promocional, criação/alteração manual no
// admin, conversão de beta e (futuramente) Stripe. O canal segue a regra
// única já definida: WhatsApp se estiver ligado, senão Telegram.
//
// WhatsApp fora da janela de 24h só aceita template aprovado — por isso, se
// o template `afonso_plano_ativado` ainda não estiver APPROVED e a conversa
// estiver fria, o envio é saltado (fica registado o motivo). Telegram não
// tem essa restrição: vai sempre em texto normal.

import { normalizeTier, TIER_DISPLAY_NAME, type SubscriptionTier } from "@/lib/subscription/tiers";
import {
  TEMPLATE_PLAN_ACTIVATED,
  planActivatedTemplatePayload,
  planActivatedText,
} from "@/lib/assessor/proactive/templates";

export function isUpgradeToPaid(
  before: string | null | undefined,
  after: string | null | undefined,
): boolean {
  const from = normalizeTier(before);
  const to = normalizeTier(after);
  return from === "base" && to !== "base";
}

export type PlanActivatedResult = {
  sent: boolean;
  channel: "whatsapp" | "telegram" | null;
  reason?: "no_channel" | "template_pending" | "send_failed" | "not_paid";
};

export async function notifyPlanActivated(
  supabaseAdmin: any,
  userId: string,
  tier: string | null | undefined,
): Promise<PlanActivatedResult> {
  const plan = normalizeTier(tier) as SubscriptionTier;
  if (plan === "base") return { sent: false, channel: null, reason: "not_paid" };

  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const target = await resolveOutboundTarget(supabaseAdmin, userId);
  if (!target) return { sent: false, channel: null, reason: "no_channel" };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  const firstName = String((prof as any)?.name ?? "").trim().split(/\s+/)[0] || "Olá";
  const planName = TIER_DISPLAY_NAME[plan];
  const text = planActivatedText(firstName, planName);

  if (target.channel === "telegram") {
    const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
    const r = await getTelegramProvider().sendText({ chatId: target.externalId, text });
    return r.ok
      ? { sent: true, channel: "telegram" }
      : { sent: false, channel: "telegram", reason: "send_failed" };
  }

  const { isWithin24hWindow } = await import("@/lib/assessor/proactive/push.server");
  const inWindow = await isWithin24hWindow(supabaseAdmin, userId, "whatsapp");

  if (inWindow) {
    const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
    const r = await sendWhatsAppText(target.externalId, text, { triggeredBy: userId, kind: "auto" });
    return r.ok
      ? { sent: true, channel: "whatsapp" }
      : { sent: false, channel: "whatsapp", reason: "send_failed" };
  }

  const { isTemplateApproved } = await import("@/lib/whatsapp/template-status.server");
  if (!(await isTemplateApproved(TEMPLATE_PLAN_ACTIVATED))) {
    return { sent: false, channel: "whatsapp", reason: "template_pending" };
  }

  const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
  const r = await sendWhatsAppPayload(
    target.externalId,
    planActivatedTemplatePayload(firstName, planName),
    { triggeredBy: userId, kind: "auto" },
  );
  return r.ok
    ? { sent: true, channel: "whatsapp" }
    : { sent: false, channel: "whatsapp", reason: "send_failed" };
}

/** Nunca deixa o aviso partir o fluxo que mudou o plano. */
export async function notifyPlanActivatedSafe(
  supabaseAdmin: any,
  userId: string,
  tier: string | null | undefined,
): Promise<void> {
  try {
    await notifyPlanActivated(supabaseAdmin, userId, tier);
  } catch (err) {
    console.error("[plano-ativado] falha a avisar:", err instanceof Error ? err.message : err);
  }
}
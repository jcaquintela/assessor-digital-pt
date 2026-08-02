// PERÍODO EXPERIMENTAL DE 14 DIAS NO WHATSAPP.
//
// Arranca quando uma conta com WhatsApp ligado sobe para Consultor ou Pro.
// Não há cobrança automática (o Stripe ainda não está ligado): a conversão
// para pago é manual (admin ou código promocional), tal como hoje.
//
//   11 dias → aviso por WhatsApp (3 dias antes de terminar)
//   14 dias → volta a 'base'. O WhatsApp continua ligado tecnicamente, mas
//             sem módulos pagos; o canal principal recalcula (Telegram se
//             for o único canal disponível). Nada do que ficou organizado
//             se perde. Auditoria: 'trial_expired_downgrade'.

import { normalizeTier } from "./tiers";

export const TRIAL_DAYS = 14;
export const TRIAL_WARN_DAYS_BEFORE = 3;
const DAY = 864e5;

export type TrialStatus = "active" | "converted" | "expired";

function firstName(name: unknown): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

async function audit(
  supabaseAdmin: any,
  action: string,
  userId: string,
  reason: string,
  metadata: Record<string, unknown>,
) {
  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: null,
    action,
    target_user_id: userId,
    resource_type: "profile",
    resource_id: userId,
    reason,
    metadata: { ...metadata, source: "trial" },
  } as never);
}

/**
 * Arranca o período experimental se a conta tiver WhatsApp ligado, o plano
 * for pago (Consultor/Pro) e ainda não tiver tido nenhum trial.
 */
export async function startWhatsAppTrialIfEligible(
  supabaseAdmin: any,
  userId: string,
  tier: string | null | undefined,
  opts: { now?: Date } = {},
): Promise<{ started: boolean; reason?: string; expiresAt?: string }> {
  const now = opts.now ?? new Date();
  const plan = normalizeTier(tier);
  if (plan !== "consultor" && plan !== "pro") return { started: false, reason: "tier_not_trialable" };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("trial_status, whatsapp_link_status")
    .eq("id", userId)
    .maybeSingle();
  if ((prof as any)?.trial_status) return { started: false, reason: "trial_already_used" };

  const { loadChannelAvailability } = await import("@/lib/assessor/primary-channel.server");
  const av = await loadChannelAvailability(supabaseAdmin, userId);
  if (!av.whatsapp) return { started: false, reason: "whatsapp_not_linked" };

  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * DAY).toISOString();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      trial_started_at: now.toISOString(),
      trial_expires_at: expiresAt,
      trial_tier: plan,
      trial_status: "active",
      trial_warned_at: null,
    } as never)
    .eq("id", userId);
  if (error) return { started: false, reason: error.message };

  await audit(supabaseAdmin, "trial_started", userId, `Período experimental de ${TRIAL_DAYS} dias iniciado (${plan}).`, {
    tier: plan, trial_days: TRIAL_DAYS, expires_at: expiresAt,
  });
  return { started: true, expiresAt };
}

/** Nunca deixa o arranque do trial partir o fluxo que mudou o plano. */
export async function startWhatsAppTrialIfEligibleSafe(
  supabaseAdmin: any,
  userId: string,
  tier: string | null | undefined,
): Promise<void> {
  try {
    await startWhatsAppTrialIfEligible(supabaseAdmin, userId, tier);
  } catch (err) {
    console.error("[trial] falha a iniciar:", err instanceof Error ? err.message : err);
  }
}

/** Conversão manual: pagamento confirmado (admin ou código promocional). */
export async function markTrialConverted(
  supabaseAdmin: any,
  userId: string,
  reason = "Pagamento confirmado manualmente.",
): Promise<{ converted: boolean }> {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("trial_status")
    .eq("id", userId)
    .maybeSingle();
  if ((prof as any)?.trial_status !== "active") return { converted: false };
  await supabaseAdmin
    .from("profiles")
    .update({ trial_status: "converted", trial_expires_at: null } as never)
    .eq("id", userId);
  await audit(supabaseAdmin, "trial_converted", userId, reason, {});
  return { converted: true };
}

async function loadActiveTrials(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name, subscription_tier, trial_tier, trial_expires_at, trial_warned_at")
    .eq("trial_status", "active")
    .not("trial_expires_at", "is", null);
  return ((data as any[]) ?? []) as {
    id: string;
    name: string | null;
    subscription_tier: string | null;
    trial_tier: string | null;
    trial_expires_at: string;
    trial_warned_at: string | null;
  }[];
}

/** Aviso aos 11 dias (3 dias antes de terminar). WhatsApp, com fallback Telegram. */
export async function warnExpiringTrials(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ warned: string[]; skipped: number }> {
  const now = opts.now ?? new Date();
  const rows = await loadActiveTrials(supabaseAdmin);
  const warned: string[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (r.trial_warned_at) { skipped++; continue; }
    const msLeft = new Date(r.trial_expires_at).getTime() - now.getTime();
    if (msLeft <= 0 || msLeft > TRIAL_WARN_DAYS_BEFORE * DAY) { skipped++; continue; }

    const days = Math.max(1, Math.ceil(msLeft / DAY));
    const name = firstName(r.name);
    const { trialEndingText, trialEndingTemplatePayload, TEMPLATE_TRIAL_ENDING } = await import(
      "@/lib/assessor/proactive/templates"
    );
    const text = trialEndingText(name, days);

    const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
    const target = await resolveOutboundTarget(supabaseAdmin, r.id);
    if (!target) { skipped++; continue; }

    let ok = false;
    let channel = target.channel;
    if (target.channel === "whatsapp") {
      const { isWithin24hWindow } = await import("@/lib/assessor/proactive/push.server");
      if (await isWithin24hWindow(supabaseAdmin, r.id, "whatsapp")) {
        const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
        ok = (await sendWhatsAppText(target.externalId, text, { triggeredBy: r.id, kind: "auto" })).ok;
      } else {
        const { isTemplateApproved } = await import("@/lib/whatsapp/template-status.server");
        if (await isTemplateApproved(TEMPLATE_TRIAL_ENDING)) {
          const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
          ok = (
            await sendWhatsAppPayload(target.externalId, trialEndingTemplatePayload(name || "Olá", days), {
              triggeredBy: r.id, kind: "auto",
            })
          ).ok;
        }
      }
      // Template ainda por aprovar ou envio falhado: tenta pelo Telegram para
      // que o consultor não seja apanhado de surpresa.
      if (!ok) {
        const { loadChannelAvailability } = await import("@/lib/assessor/primary-channel.server");
        const av = await loadChannelAvailability(supabaseAdmin, r.id);
        if (av.telegram) {
          const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
          ok = (await getTelegramProvider().sendText({ chatId: av.telegram, text })).ok;
          channel = "telegram";
        }
      }
    } else {
      const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
      ok = (await getTelegramProvider().sendText({ chatId: target.externalId, text })).ok;
    }

    if (!ok) { skipped++; continue; }

    await supabaseAdmin.from("assessor_messages").insert({
      user_id: r.id,
      role: "assistant",
      content: text,
      channel,
      message_type: "trial_ending",
      status: "sent",
    } as never);
    await supabaseAdmin
      .from("profiles")
      .update({ trial_warned_at: now.toISOString() } as never)
      .eq("id", r.id);
    await audit(supabaseAdmin, "trial_ending_warning", r.id, `Aviso de fim de período experimental (${days} dias).`, {
      days_left: days, channel,
    });
    warned.push(r.id);
  }

  return { warned, skipped };
}

/** Fim dos 14 dias sem confirmação de pagamento: volta a 'base'. */
export async function expireDueTrials(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ expired: { userId: string; fromTier: string; primaryChannel: string | null }[] }> {
  const now = opts.now ?? new Date();
  const rows = await loadActiveTrials(supabaseAdmin);
  const expired: { userId: string; fromTier: string; primaryChannel: string | null }[] = [];

  for (const r of rows) {
    if (new Date(r.trial_expires_at).getTime() > now.getTime()) continue;
    const fromTier = normalizeTier(r.subscription_tier);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_tier: "base", trial_status: "expired" } as never)
      .eq("id", r.id);
    if (error) {
      console.error("[trial] downgrade falhou", r.id, error.message);
      continue;
    }

    // O WhatsApp fica ligado tecnicamente; o canal principal recalcula.
    const { recomputePrimaryChannel } = await import("@/lib/assessor/primary-channel.server");
    const primary = await recomputePrimaryChannel(supabaseAdmin, r.id);

    await audit(
      supabaseAdmin,
      "trial_expired_downgrade",
      r.id,
      "Período experimental terminado sem confirmação de pagamento.",
      {
        before: { subscription_tier: fromTier, trial_status: "active" },
        after: { subscription_tier: "base", trial_status: "expired" },
        trial_tier: r.trial_tier,
        primary_channel: primary,
      },
    );

    // Aviso curto — nada do que ficou organizado se perde.
    try {
      const { trialExpiredText } = await import("@/lib/assessor/proactive/templates");
      const { sendOutbound } = await import("@/lib/assessor/primary-channel.server");
      await sendOutbound(supabaseAdmin, r.id, trialExpiredText(firstName(r.name)));
    } catch (err) {
      console.error("[trial] aviso de fim falhou:", err);
    }

    expired.push({ userId: r.id, fromTier, primaryChannel: primary });
  }

  return { expired };
}

/** Corrida diária: avisar aos 11 dias e expirar aos 14. */
export async function runTrialLifecycle(supabaseAdmin: any, opts: { now?: Date } = {}) {
  const warn = await warnExpiringTrials(supabaseAdmin, opts);
  const exp = await expireDueTrials(supabaseAdmin, opts);
  return { warned: warn.warned.length, expired: exp.expired.length, details: exp.expired };
}
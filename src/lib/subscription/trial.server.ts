// PERÍODO EXPERIMENTAL — UM SÓ MODELO, IGUAL PARA TODOS.
//
// Arranca quando o WhatsApp é ligado à conta, seja qual for o plano actual.
// Não existe trial por tier: é sempre a mesma experiência completa de 14
// dias. Não há cobrança automática (Stripe ainda não ligado): a confirmação
// de pagamento é manual (admin ou código promocional).
//
//   dia 7  → resumo de valor (não pede nada)
//   dia 12 → pedido de escolha de plano (Consultor, Pro ou Base)
//   dia 14 → aplica a escolha automaticamente; sem escolha, fica em Base
//
// NUNCA há migração de conta. A conta, a identidade e o histórico são
// sempre os mesmos em qualquer canal — o que muda são as CAPACIDADES.
// Ao descer de plano, a conta entra em arquivo acessível em modo leitura
// durante 90 dias; registos estruturados não expiram nunca.

import { normalizeTier } from "./tiers";
import { recordSubscriptionEvent, trialOutcomeEvent } from "./events.server";

export const TRIAL_DAYS = 14;
/** Dia do resumo de valor (sem pedido). */
export const TRIAL_VALUE_SUMMARY_DAY = 7;
/** Dia em que se pede a escolha de plano. */
export const TRIAL_CHOICE_DAY = 12;
/** Arquivo em modo leitura após descida de plano. */
export const READONLY_ARCHIVE_DAYS = 90;
/** Plano aplicado quando o consultor não escolhe nada. */
export const TRIAL_DEFAULT_CHOICE = "base" as const;
/** Nível de capacidades durante o período experimental. */
export const TRIAL_CAPABILITY_TIER = "consultor" as const;

const DAY = 864e5;

export type TrialStatus = "active" | "converted" | "expired";
export type TrialChoice = "consultor" | "pro" | "base";

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
 * Arranca o período experimental assim que a conta tem WhatsApp ligado,
 * seja qual for o plano actual, e desde que ainda não tenha havido trial.
 */
export async function startWhatsAppTrialIfEligible(
  supabaseAdmin: any,
  userId: string,
  tier: string | null | undefined,
  opts: { now?: Date } = {},
): Promise<{ started: boolean; reason?: string; expiresAt?: string }> {
  const now = opts.now ?? new Date();
  const plan = normalizeTier(tier);

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
  const patch: Record<string, unknown> = {
    trial_started_at: now.toISOString(),
    trial_expires_at: expiresAt,
    trial_tier: TRIAL_CAPABILITY_TIER,
    trial_status: "active",
    trial_warned_at: null,
    trial_choice: null,
    trial_value_summary_at: null,
    trial_choice_asked_at: null,
  };
  // Experiência completa durante o trial, mesmo para quem está em Base.
  if (plan === "base") patch["subscription_tier"] = TRIAL_CAPABILITY_TIER;

  const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", userId);
  if (error) return { started: false, reason: error.message };

  await audit(supabaseAdmin, "trial_started", userId, `Período experimental de ${TRIAL_DAYS} dias iniciado.`, {
    tier_before: plan, trial_days: TRIAL_DAYS, expires_at: expiresAt,
  });
  await recordSubscriptionEvent(supabaseAdmin, {
    userId, event: "trial_started", fromTier: plan, toTier: TRIAL_CAPABILITY_TIER, source: "whatsapp_link",
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
    .select("trial_status, subscription_tier")
    .eq("id", userId)
    .maybeSingle();
  if ((prof as any)?.trial_status !== "active") return { converted: false };
  await supabaseAdmin
    .from("profiles")
    .update({ trial_status: "converted", trial_expires_at: null, readonly_until: null } as never)
    .eq("id", userId);
  await audit(supabaseAdmin, "trial_converted", userId, reason, {});
  const to = normalizeTier((prof as any)?.subscription_tier);
  await recordSubscriptionEvent(supabaseAdmin, {
    userId, event: trialOutcomeEvent(to), fromTier: "trial", toTier: to, source: "payment_confirmed",
  });
  return { converted: true };
}

/* ---------------- Escolha de plano feita pelo consultor ---------------- */

/** Lê uma escolha de plano numa resposta livre. Devolve null se não houver. */
export function readTrialChoice(text: string): TrialChoice | null {
  const t = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!t || t.length > 60) return null;
  if (/\bpro\b/.test(t)) return "pro";
  if (/\bconsultor(a)?\b/.test(t)) return "consultor";
  if (/\bbase\b|\bgratuito\b|\bnenhum\b/.test(t)) return "base";
  return null;
}

/** Guarda a escolha; é aplicada no fim dos 14 dias (ou já, se pedires). */
export async function setTrialChoice(
  supabaseAdmin: any,
  userId: string,
  choice: TrialChoice,
): Promise<{ saved: boolean }> {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("trial_status")
    .eq("id", userId)
    .maybeSingle();
  if ((prof as any)?.trial_status !== "active") return { saved: false };
  await supabaseAdmin.from("profiles").update({ trial_choice: choice } as never).eq("id", userId);
  await audit(supabaseAdmin, "trial_choice_saved", userId, `Escolha de plano: ${choice}.`, { choice });
  return { saved: true };
}

export function trialChoiceAck(choice: TrialChoice): string {
  if (choice === "base") {
    return (
      "Registado: ficas no plano Base quando o período experimental acabar. " +
      "É a mesma conta e o mesmo histórico — só ficam disponíveis menos funcionalidades."
    );
  }
  const label = choice === "pro" ? "Pro" : "Consultor";
  return `Registado: plano ${label} quando o período experimental acabar. Continua tudo exactamente onde está.`;
}

async function loadActiveTrials(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, name, subscription_tier, trial_tier, trial_started_at, trial_expires_at, trial_warned_at, trial_choice, trial_value_summary_at, trial_choice_asked_at",
    )
    .eq("trial_status", "active")
    .not("trial_expires_at", "is", null);
  return ((data as any[]) ?? []) as {
    id: string;
    name: string | null;
    subscription_tier: string | null;
    trial_tier: string | null;
    trial_started_at: string | null;
    trial_expires_at: string;
    trial_warned_at: string | null;
    trial_choice: string | null;
    trial_value_summary_at: string | null;
    trial_choice_asked_at: string | null;
  }[];
}

/** Envio simples com fallback de canal, sem templates. */
async function notify(
  supabaseAdmin: any,
  userId: string,
  text: string,
  messageType: string,
): Promise<boolean> {
  try {
    const { sendOutbound } = await import("@/lib/assessor/primary-channel.server");
    const res: any = await sendOutbound(supabaseAdmin, userId, text);
    const ok = res?.ok !== false;
    if (ok) {
      await supabaseAdmin.from("assessor_messages").insert({
        user_id: userId,
        role: "assistant",
        content: text,
        channel: res?.channel ?? null,
        message_type: messageType,
        status: "sent",
      } as never);
    }
    return ok;
  } catch (err) {
    console.error(`[trial] ${messageType} falhou:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** Dia 7: resumo de valor. Não pede nada, só mostra o que já foi feito. */
export async function sendTrialValueSummaries(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ sent: string[] }> {
  const now = opts.now ?? new Date();
  const rows = await loadActiveTrials(supabaseAdmin);
  const sent: string[] = [];

  for (const r of rows) {
    if (r.trial_value_summary_at || !r.trial_started_at) continue;
    const elapsedDays = (now.getTime() - new Date(r.trial_started_at).getTime()) / DAY;
    if (elapsedDays < TRIAL_VALUE_SUMMARY_DAY) continue;

    const count = async (table: string) => {
      const { count: n } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", r.id);
      return Number(n ?? 0);
    };
    const stats = {
      people: await count("people"),
      properties: await count("properties"),
      followUps: await count("follow_ups"),
    };

    const { trialValueSummaryText } = await import("@/lib/assessor/proactive/templates");
    const ok = await notify(supabaseAdmin, r.id, trialValueSummaryText(firstName(r.name), stats), "trial_value_summary");
    if (!ok) continue;

    await supabaseAdmin
      .from("profiles")
      .update({ trial_value_summary_at: now.toISOString() } as never)
      .eq("id", r.id);
    await audit(supabaseAdmin, "trial_value_summary", r.id, "Resumo de valor do dia 7 enviado.", stats);
    sent.push(r.id);
  }
  return { sent };
}

/** Dia 12: pedido de escolha de plano. */
export async function askTrialChoice(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ asked: string[] }> {
  const now = opts.now ?? new Date();
  const rows = await loadActiveTrials(supabaseAdmin);
  const asked: string[] = [];

  for (const r of rows) {
    if (r.trial_choice_asked_at || r.trial_choice || !r.trial_started_at) continue;
    const elapsedDays = (now.getTime() - new Date(r.trial_started_at).getTime()) / DAY;
    if (elapsedDays < TRIAL_CHOICE_DAY) continue;

    const { trialChoiceText } = await import("@/lib/assessor/proactive/templates");
    const ok = await notify(supabaseAdmin, r.id, trialChoiceText(firstName(r.name)), "trial_choice");
    if (!ok) continue;

    await supabaseAdmin
      .from("profiles")
      .update({ trial_choice_asked_at: now.toISOString() } as never)
      .eq("id", r.id);
    await audit(supabaseAdmin, "trial_choice_asked", r.id, "Pedido de escolha de plano (dia 12).", {});
    asked.push(r.id);
  }
  return { asked };
}

/**
 * Aviso de fim próximo (dia 12), por WhatsApp com fallback Telegram. Usa
 * template aprovado quando a janela de 24h já fechou.
 */
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
    if (msLeft <= 0 || msLeft > (TRIAL_DAYS - TRIAL_CHOICE_DAY) * DAY) { skipped++; continue; }

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

/**
 * Fim dos 14 dias: aplica a escolha do consultor (ou Base, por omissão).
 * Nada é apagado; ao descer, a conta fica com arquivo em modo leitura
 * durante 90 dias.
 */
export async function expireDueTrials(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{
  expired: { userId: string; fromTier: string; toTier: string; primaryChannel: string | null }[];
}> {
  const now = opts.now ?? new Date();
  const rows = await loadActiveTrials(supabaseAdmin);
  const expired: { userId: string; fromTier: string; toTier: string; primaryChannel: string | null }[] = [];

  for (const r of rows) {
    if (new Date(r.trial_expires_at).getTime() > now.getTime()) continue;
    const fromTier = normalizeTier(r.subscription_tier);
    const choice = (readTrialChoice(r.trial_choice ?? "") ?? TRIAL_DEFAULT_CHOICE) as TrialChoice;
    const downgrade = choice === "base";

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        subscription_tier: choice,
        trial_status: choice === "base" ? "expired" : "converted",
        readonly_until: downgrade
          ? new Date(now.getTime() + READONLY_ARCHIVE_DAYS * DAY).toISOString()
          : null,
      } as never)
      .eq("id", r.id);
    if (error) {
      console.error("[trial] fim de período falhou", r.id, error.message);
      continue;
    }

    // A conta é a mesma; só mudam capacidades. O canal principal recalcula.
    const { recomputePrimaryChannel } = await import("@/lib/assessor/primary-channel.server");
    const primary = await recomputePrimaryChannel(supabaseAdmin, r.id);

    await audit(
      supabaseAdmin,
      downgrade ? "trial_expired_downgrade" : "trial_expired_choice_applied",
      r.id,
      downgrade
        ? "Período experimental terminado; plano Base aplicado. Dados mantidos."
        : `Período experimental terminado; plano ${choice} aplicado.`,
      {
        before: { subscription_tier: fromTier, trial_status: "active" },
        after: { subscription_tier: choice },
        choice,
        explicit_choice: Boolean(r.trial_choice),
        readonly_archive_days: downgrade ? READONLY_ARCHIVE_DAYS : null,
        primary_channel: primary,
      },
    );
    await recordSubscriptionEvent(supabaseAdmin, {
      userId: r.id,
      event: trialOutcomeEvent(choice),
      fromTier,
      toTier: choice,
      source: r.trial_choice ? "trial_choice" : "trial_default",
    });

    // Aviso curto — nada do que ficou organizado se perde.
    try {
      const { trialExpiredText, planActivatedText } = await import("@/lib/assessor/proactive/templates");
      const name = firstName(r.name);
      const text = downgrade
        ? trialExpiredText(name)
        : planActivatedText(name || "Olá", choice === "pro" ? "Pro" : "Consultor");
      const { sendOutbound } = await import("@/lib/assessor/primary-channel.server");
      await sendOutbound(supabaseAdmin, r.id, text);
    } catch (err) {
      console.error("[trial] aviso de fim falhou:", err);
    }

    expired.push({ userId: r.id, fromTier, toTier: choice, primaryChannel: primary });
  }

  return { expired };
}

/** Corrida diária: dia 7, dia 12 e fim aos 14. */
export async function runTrialLifecycle(supabaseAdmin: any, opts: { now?: Date } = {}) {
  const summary = await sendTrialValueSummaries(supabaseAdmin, opts);
  const ask = await askTrialChoice(supabaseAdmin, opts);
  const warn = await warnExpiringTrials(supabaseAdmin, opts);
  const exp = await expireDueTrials(supabaseAdmin, opts);
  return {
    valueSummaries: summary.sent.length,
    choiceAsked: ask.asked.length,
    warned: warn.warned.length,
    expired: exp.expired.length,
    details: exp.expired,
  };
}
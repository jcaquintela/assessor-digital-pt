// Resgate de código promocional numa conta JÁ existente (qualquer canal).
//
// Diferente de promo.server.ts, que só cobre o primeiro contacto (conta nova).
// Aqui o consultor já tem conta: pedimos confirmação antes de aplicar, e
// qualquer erro tem resposta honesta — nunca "não percebi".

import { normalizeTier, tierAtLeast, TIER_DISPLAY_NAME, type SubscriptionTier } from "@/lib/subscription/tiers";

export const PROMO_CONFIRM_TTL_MIN = 15;

export type PromoCheck =
  | { ok: true; codeId: string; code: string; tier: SubscriptionTier; betaDays: number | null }
  | {
      ok: false;
      reason: "not_found" | "inactive" | "expired" | "exhausted" | "already_used" | "tier_not_lower";
      reply: string;
    };

function replyFor(reason: Exclude<PromoCheck, { ok: true }>["reason"], tier?: SubscriptionTier): string {
  switch (reason) {
    case "not_found":
      return "Esse código não existe. Confirma como está escrito e envia outra vez.";
    case "inactive":
      return "Esse código já não está ativo.";
    case "expired":
      return "Esse código já expirou.";
    case "exhausted":
      return "Esse código já foi usado o número máximo de vezes.";
    case "already_used":
      return "Já usaste esse código nesta conta — não dá para aplicar duas vezes.";
    case "tier_not_lower":
      return `Já tens um plano igual ou superior ao que esse código dá (${TIER_DISPLAY_NAME[tier ?? "base"]}) — não é preciso aplicá-lo.`;
  }
}

/** Valida o código para esta conta. Não consome nada. */
export async function checkPromoForUser(
  supabaseAdmin: any,
  rawCode: string,
  userId: string,
): Promise<PromoCheck> {
  const code = rawCode.trim().toUpperCase();
  const { data } = await supabaseAdmin
    .from("promo_codes")
    .select("id, code, grants_tier, max_uses, used_count, expires_at, active, is_beta, beta_days")
    .eq("code", code)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found", reply: replyFor("not_found") };
  const row = data as {
    id: string; code: string; grants_tier: string; max_uses: number; used_count: number;
    expires_at: string | null; active: boolean; is_beta?: boolean | null; beta_days?: number | null;
  };
  if (!row.active) return { ok: false, reason: "inactive", reply: replyFor("inactive") };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired", reply: replyFor("expired") };
  }
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return { ok: false, reason: "exhausted", reply: replyFor("exhausted") };
  }

  const { data: used } = await supabaseAdmin
    .from("promo_redemptions")
    .select("id")
    .eq("user_id", userId)
    .eq("code_id", row.id)
    .eq("status", "applied")
    .maybeSingle();
  if (used) return { ok: false, reason: "already_used", reply: replyFor("already_used") };

  const tier = normalizeTier(row.grants_tier);
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();
  const current = normalizeTier((prof as { subscription_tier?: string } | null)?.subscription_tier);
  if (tierAtLeast(current, tier)) {
    return { ok: false, reason: "tier_not_lower", reply: replyFor("tier_not_lower", tier) };
  }

  return {
    ok: true,
    codeId: row.id,
    code: row.code,
    tier,
    betaDays: row.is_beta && row.beta_days ? row.beta_days : null,
  };
}

export function promoConfirmQuestion(tier: SubscriptionTier): string {
  return `Encontrei um código que dá acesso a ${TIER_DISPLAY_NAME[tier]}. Queres aplicar à tua conta?`;
}

/** Guarda o pedido à espera de confirmação (15 min). */
export async function stagePromoConfirmation(
  supabaseAdmin: any,
  args: { userId: string; channel: string; codeId: string; code: string; tier: SubscriptionTier },
): Promise<void> {
  await supabaseAdmin
    .from("promo_redemptions")
    .upsert(
      {
        user_id: args.userId,
        code_id: args.codeId,
        code: args.code,
        granted_tier: args.tier,
        channel: args.channel,
        status: "pending",
        expires_at: new Date(Date.now() + PROMO_CONFIRM_TTL_MIN * 60_000).toISOString(),
      } as never,
      { onConflict: "user_id,code_id" },
    );
}

export type PendingPromo = {
  id: string;
  codeId: string;
  code: string;
  tier: SubscriptionTier;
};

export async function loadPendingPromo(
  supabaseAdmin: any,
  userId: string,
  channel: string,
): Promise<PendingPromo | null> {
  const { data } = await supabaseAdmin
    .from("promo_redemptions")
    .select("id, code_id, code, granted_tier, expires_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; code_id: string; code: string; granted_tier: string; expires_at: string | null };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return { id: row.id, codeId: row.code_id, code: row.code, tier: normalizeTier(row.granted_tier) };
}

export async function cancelPendingPromo(supabaseAdmin: any, id: string): Promise<void> {
  await supabaseAdmin.from("promo_redemptions").update({ status: "cancelled" } as never).eq("id", id);
}

/** Aplica mesmo: plano, beta, contador de usos e aviso ao consultor. */
export async function applyPromoToUser(
  supabaseAdmin: any,
  userId: string,
  pending: PendingPromo,
): Promise<{ ok: boolean; reply: string }> {
  // Revalidar à hora de aplicar — o código pode ter esgotado entretanto.
  const check = await checkPromoForUser(supabaseAdmin, pending.code, userId);
  if (!check.ok) {
    await cancelPendingPromo(supabaseAdmin, pending.id);
    return { ok: false, reply: check.reply };
  }

  const { data: fresh } = await supabaseAdmin
    .from("promo_codes")
    .select("used_count")
    .eq("id", check.codeId)
    .maybeSingle();
  await supabaseAdmin
    .from("promo_codes")
    .update({ used_count: Number((fresh as { used_count?: number } | null)?.used_count ?? 0) + 1 } as never)
    .eq("id", check.codeId);

  const patch: Record<string, unknown> = { subscription_tier: check.tier };
  if (check.betaDays) {
    patch['is_beta_tester'] = true;
    patch['beta_expires_at'] = new Date(Date.now() + check.betaDays * 86400000).toISOString();
  }
  await supabaseAdmin.from("profiles").update(patch as never).eq("id", userId);

  await supabaseAdmin
    .from("promo_redemptions")
    .update({ status: "applied", confirmed_at: new Date().toISOString(), granted_tier: check.tier } as never)
    .eq("id", pending.id);

  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: null,
    action: "promo.redeemed_existing_account",
    target_user_id: userId,
    resource_type: "promo_code",
    resource_id: check.codeId,
    reason: `Código ${check.code} aplicado por conta existente.`,
    metadata: { code: check.code, tier: check.tier, beta_days: check.betaDays },
  } as never);

  const { notifyPlanActivatedSafe } = await import("@/lib/subscription/plan-activated.server");
  await notifyPlanActivatedSafe(supabaseAdmin, userId, check.tier);

  return {
    ok: true,
    reply: `Feito — a tua conta passou para ${TIER_DISPLAY_NAME[check.tier]}.`,
  };
}

const YES_RE = /^(sim|sim\b.*|aplica|aplicar|confirmo|confirmar|ok|claro|quero|pode ser|yes)\b/i;
const NO_RE = /^(n[ãa]o|nao|ainda n[ãa]o|deixa|cancela|cancelar|no)\b/i;

export function readConfirmation(text: string): "yes" | "no" | null {
  const t = text.trim();
  if (!t) return null;
  if (YES_RE.test(t)) return "yes";
  if (NO_RE.test(t)) return "no";
  return null;
}

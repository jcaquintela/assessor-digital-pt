// Resgate de códigos promocionais nos canais (Telegram / WhatsApp).
// Server-only: usa sempre o cliente admin já autorizado pelo chamador.
import { normalizeTier } from "@/lib/subscription/tiers";

export type PromoRedeemResult =
  | { ok: true; tier: string; code: string; betaDays: number | null }
  | { ok: false; reason: "not_found" | "inactive" | "expired" | "exhausted" };

export function looksLikePromoCode(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40 || /\s/.test(t)) return false;
  if (/^LIGAR-/i.test(t)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/.test(t);
}

// Valida e consome um código. Incrementa used_count só quando é válido.
export async function redeemPromoCode(
  supabaseAdmin: any,
  rawCode: string,
): Promise<PromoRedeemResult> {
  const code = rawCode.trim().toUpperCase();
  const { data } = await supabaseAdmin
    .from("promo_codes")
    .select("id, code, grants_tier, max_uses, used_count, expires_at, active, is_beta, beta_days")
    .eq("code", code)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as {
    id: string;
    code: string;
    grants_tier: string;
    max_uses: number;
    used_count: number;
    expires_at: string | null;
    active: boolean;
    is_beta?: boolean | null;
    beta_days?: number | null;
  };
  if (!row.active) return { ok: false, reason: "inactive" };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return { ok: false, reason: "exhausted" };
  }
  await supabaseAdmin
    .from("promo_codes")
    .update({ used_count: row.used_count + 1 } as never)
    .eq("id", row.id);
  return {
    ok: true,
    tier: normalizeTier(row.grants_tier),
    code: row.code,
    betaDays: row.is_beta && row.beta_days ? row.beta_days : null,
  };
}

// Marca a conta como beta tester quando o código veio de um convite de teste.
export async function applyPromoBeta(
  supabaseAdmin: any,
  userId: string,
  betaDays: number | null,
): Promise<void> {
  if (!betaDays) return;
  const expires = new Date(Date.now() + betaDays * 86400000).toISOString();
  await supabaseAdmin
    .from("profiles")
    .update({ is_beta_tester: true, beta_expires_at: expires } as never)
    .eq("id", userId);
}

export const PROMO_REPLY: Record<
  Exclude<PromoRedeemResult, { ok: true }>["reason"],
  string
> = {
  not_found: "Esse código não existe. Confirma como está escrito.",
  inactive: "Esse código já não está ativo.",
  expired: "Esse código já expirou.",
  exhausted: "Esse código já foi usado o número máximo de vezes.",
};
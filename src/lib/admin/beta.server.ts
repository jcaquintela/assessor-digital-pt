// Expiração automática de períodos de teste (beta testers).
// Server-only. Corre pelo cron (/api/public/hooks/beta-expiry) e nunca depende
// de alguém abrir uma página. A conta e os dados ficam; só o plano volta a Base.

export type BetaExpiryResult = {
  checked: number;
  expired: { user_id: string; email: string | null; from_tier: string; expired_at: string }[];
};

export async function expireDueBetaTesters(supabaseAdmin: any): Promise<BetaExpiryResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, subscription_tier, beta_expires_at")
    .eq("is_beta_tester", true)
    .not("beta_expires_at", "is", null)
    .lt("beta_expires_at", nowIso);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    email: string | null;
    subscription_tier: string | null;
    beta_expires_at: string;
  }[];

  const expired: BetaExpiryResult["expired"] = [];
  for (const r of rows) {
    const before = {
      subscription_tier: r.subscription_tier ?? "base",
      is_beta_tester: true,
      beta_expires_at: r.beta_expires_at,
    };
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_tier: "base", is_beta_tester: false } as never)
      .eq("id", r.id);
    if (upErr) {
      console.error("[beta-expiry] update falhou", r.id, upErr.message);
      continue;
    }
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: "beta.expired_auto",
      target_user_id: r.id,
      resource_type: "profile",
      resource_id: r.id,
      reason: "Período de teste terminado automaticamente.",
      metadata: {
        before,
        after: { subscription_tier: "base", is_beta_tester: false, beta_expires_at: r.beta_expires_at },
        source: "cron:beta-expiry",
      } as any,
    } as never);
    expired.push({
      user_id: r.id,
      email: r.email,
      from_tier: before.subscription_tier,
      expired_at: r.beta_expires_at,
    });
  }

  return { checked: rows.length, expired };
}

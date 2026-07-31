// Entrada no painel para quem só tem Telegram/WhatsApp (sem palavra-passe).
// O consultor pede "entrar" ao Afonso, recebe um link temporário de uso único
// e esse link troca-se por uma sessão real do Supabase.
//
// Server-only: usa node:crypto e o service role.

export const LOGIN_TOKEN_TTL_MIN = 15;

export function appBaseUrl(): string {
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.SITE_URL ||
    "https://assessor-digital-pt.lovable.app"
  ).replace(/\/+$/, "");
}

const LOGIN_RE = /^\/?(entrar|login|painel|dashboard|abrir painel|entrar no painel)$/i;

export function looksLikeLoginRequest(text: string | null | undefined): boolean {
  return LOGIN_RE.test((text ?? "").trim());
}

// Gera o link temporário para o consultor autenticado por canal.
export async function issueDashboardLoginLink(
  supabaseAdmin: any,
  userId: string,
  channel: string,
): Promise<{ url: string; expiresAt: string }> {
  const { randomBytes } = await import("crypto");

  // Invalida links anteriores por usar.
  await supabaseAdmin
    .from("dashboard_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  const token = `lg_${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MIN * 60_000).toISOString();
  const { error } = await supabaseAdmin
    .from("dashboard_login_tokens")
    .insert({ token, user_id: userId, channel, expires_at: expiresAt });
  if (error) throw new Error(error.message);

  return { url: `${appBaseUrl()}/entrar?token=${token}`, expiresAt };
}

export const LOGIN_LINK_REPLY = (url: string) =>
  `Aqui tens a tua entrada no painel:\n${url}\n\nÉ válida durante ${LOGIN_TOKEN_TTL_MIN} minutos e só funciona uma vez.`;

export type RedeemResult =
  | { ok: true; email: string; tokenHash: string }
  | { ok: false; reason: "invalid" | "failed" };

// Troca o token por um token_hash de magic link (o email das contas criadas
// pelo Telegram não é entregável — nunca enviamos email, só devolvemos o hash).
export async function redeemDashboardLoginToken(token: string): Promise<RedeemResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data } = await supabaseAdmin
    .from("dashboard_login_tokens")
    .select("token, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  const row = data as { user_id: string; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "invalid" };
  }

  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
  const email = userRes?.user?.email as string | undefined;
  if (!email) return { ok: false, reason: "failed" };

  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = (link as any)?.properties?.hashed_token as string | undefined;
  if (error || !tokenHash) {
    console.error("[dashboard-login] generateLink:", error);
    return { ok: false, reason: "failed" };
  }

  await supabaseAdmin
    .from("dashboard_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  return { ok: true, email, tokenHash };
}
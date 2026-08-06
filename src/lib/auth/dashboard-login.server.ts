// Entrada no painel para quem só tem Telegram/WhatsApp (sem palavra-passe).
// O consultor pede "entrar" ao Afonso, recebe um link temporário de uso único
// e esse link troca-se por uma sessão real do Supabase.
//
// Server-only: usa node:crypto e o service role.

export const LOGIN_TOKEN_TTL_MIN = 15;

// Um link acabado de usar continua a funcionar durante uns minutos: recarregar
// a página, voltar atrás ou o browser repetir o pedido não pode deixar o
// consultor sem entrada.
export const REDEEM_GRACE_MS = 5 * 60_000;

// Clientes de mensagens (WhatsApp, Outlook, etc.) colam pontuação ao link.
export function normalizeLoginToken(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^[<"'(\[]+/, "")
    .replace(/[>"')\].,;:!?]+$/, "")
    .trim()
    .toLowerCase();
}

// Domínio público oficial do produto. Os links de entrada enviados ao consultor
// (WhatsApp, Telegram, painel) usam sempre este domínio, nunca o de preview.
export const PRODUCTION_APP_URL = "https://app.meuafonso.com";

// Domínios internos do Lovable (preview/staging). Nunca podem sair num link
// enviado ao consultor.
export const INTERNAL_HOST_RE = /(^|\.)lovable\.(app|dev)$/i;

export function isInternalPreviewUrl(url: string): boolean {
  try {
    return INTERNAL_HOST_RE.test(new URL(url).hostname);
  } catch {
    return /lovable\.(app|dev)/i.test(url);
  }
}

// Rede de segurança: se alguma regressão fizer um link apontar para preview,
// falhamos em vez de enviar um link inútil ao consultor.
export function assertPublicLoginUrl(url: string): string {
  if (isInternalPreviewUrl(url)) {
    throw new Error(
      `[dashboard-login] link de entrada com domínio interno recusado: ${url}. Usa ${PRODUCTION_APP_URL}.`,
    );
  }
  return url;
}

export function appBaseUrl(): string {
  const configured = (process.env.APP_PUBLIC_URL || process.env.SITE_URL || "").trim();
  // Ignora valores de staging/preview: um link interno do Lovable não serve
  // para quem recebe a mensagem.
  const usable = configured && !isInternalPreviewUrl(configured) ? configured : PRODUCTION_APP_URL;
  return usable.replace(/\/+$/, "");
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

  const url = assertPublicLoginUrl(`${appBaseUrl()}/entrar?token=${token}`);
  return { url, expiresAt };
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

  const clean = normalizeLoginToken(token);
  const { data } = await supabaseAdmin
    .from("dashboard_login_tokens")
    .select("token, user_id, expires_at, used_at")
    .eq("token", clean)
    .maybeSingle();
  const row = data as { user_id: string; expires_at: string; used_at: string | null } | null;
  const usedTooLongAgo =
    !!row?.used_at && Date.now() - new Date(row.used_at).getTime() > REDEEM_GRACE_MS;
  if (!row || usedTooLongAgo || new Date(row.expires_at).getTime() < Date.now()) {
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
    .eq("token", clean);

  return { ok: true, email, tokenHash };
}

/* ------------------------- Pedir um link novo ---------------------------- */

export type ReissueResult =
  | { ok: true; channel: string }
  | { ok: false; reason: "unknown_token" | "no_channel" | "too_soon" };

// Recuperação a partir do próprio ecrã de erro: o token antigo (gasto ou
// expirado) diz-nos quem é o consultor e por onde falar com ele.
export async function reissueLoginLinkFromToken(token: string): Promise<ReissueResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const clean = normalizeLoginToken(token);

  const { data } = await supabaseAdmin
    .from("dashboard_login_tokens")
    .select("user_id, channel, created_at")
    .eq("token", clean)
    .maybeSingle();
  const row = data as { user_id: string; channel: string; created_at: string } | null;
  if (!row) return { ok: false, reason: "unknown_token" };

  const { data: fresh } = await supabaseAdmin
    .from("dashboard_login_tokens")
    .select("created_at")
    .eq("user_id", row.user_id)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = (fresh as { created_at: string }[] | null)?.[0]?.created_at;
  if (last && Date.now() - new Date(last).getTime() < 30_000) {
    return { ok: false, reason: "too_soon" };
  }

  const channel = row.channel === "telegram" ? "telegram" : "whatsapp";
  const { data: link } = await supabaseAdmin
    .from("channel_links")
    .select("external_id")
    .eq("user_id", row.user_id)
    .eq("channel", channel)
    .maybeSingle();
  const externalId = (link as { external_id?: string } | null)?.external_id;
  if (!externalId) return { ok: false, reason: "no_channel" };

  const { url } = await issueDashboardLoginLink(supabaseAdmin, row.user_id, channel);
  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  await sendReplyForChannel(channel as any, externalId, LOGIN_LINK_REPLY(url));
  return { ok: true, channel };
}
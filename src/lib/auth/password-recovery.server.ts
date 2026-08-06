// Recuperação de palavra-passe para quem já definiu uma e não se lembra.
// Quem fala com o Afonso por WhatsApp/Telegram recebe aí um link de entrada
// que abre logo o ecrã de nova palavra-passe (o email dessas contas pode ser
// sintético e não receber nada). Os restantes recebem o email normal.

import { isPlaceholderEmail } from "@/lib/profile/email";

export type RecoveryOutcome = { sentViaChannel: boolean };

const THROTTLE_MS = 60_000;

export const RECOVERY_LINK_REPLY = (url: string, minutes: number) =>
  `Pediste para recuperar a palavra-passe. Abre este link e define uma nova:\n${url}\n\nÉ válido durante ${minutes} minutos e só funciona uma vez.`;

export async function sendPasswordRecovery(email: string): Promise<RecoveryOutcome> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { sentViaChannel: false };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .ilike("email", clean)
    .maybeSingle();
  const userId = (profile as { id?: string } | null)?.id;
  // Conta desconhecida: comportamento igual ao de uma conta com email real,
  // para não revelar quem existe.
  if (!userId) return { sentViaChannel: false };

  const { data: links } = await supabaseAdmin
    .from("channel_links")
    .select("channel, external_id")
    .eq("user_id", userId);
  const rows = (links ?? []) as { channel: string; external_id: string }[];
  const link =
    rows.find((r) => r.channel === "whatsapp") ?? rows.find((r) => r.channel === "telegram");

  const emailUsable = !isPlaceholderEmail((profile as { email?: string } | null)?.email);
  // Com email real preferimos o email; o canal é a rede de segurança de quem
  // não tem email entregável.
  if (!link || emailUsable) return { sentViaChannel: false };

  const { data: recent } = await supabaseAdmin
    .from("dashboard_login_tokens")
    .select("created_at")
    .eq("user_id", userId)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = (recent as { created_at: string }[] | null)?.[0]?.created_at;
  if (last && Date.now() - new Date(last).getTime() < THROTTLE_MS) {
    return { sentViaChannel: true };
  }

  const { issueDashboardLoginLink, LOGIN_TOKEN_TTL_MIN } = await import("./dashboard-login.server");
  const { url } = await issueDashboardLoginLink(supabaseAdmin, userId, link.channel, {
    reason: "recuperar palavra-passe",
  });
  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  await sendReplyForChannel(
    link.channel as any,
    link.external_id,
    RECOVERY_LINK_REPLY(`${url}&pw=1`, LOGIN_TOKEN_TTL_MIN),
  );
  return { sentViaChannel: true };
}
// Aviso proativo de reautorização do Gmail.
//
// Em modo Teste o Google corta o acesso de 7 em 7 dias. Se isso acontecer em
// silêncio, o consultor descobre pela pior via: o Afonso deixa de ver emails
// e ninguém lhe diz porquê. Por isso avisamos a 24h do fim, uma vez por dia.

import { shouldWarnReauth, hoursUntilExpiry, reauthWarningMessage } from "./reauth";

export async function warnExpiringGmailConnections(
  supabaseAdmin: any,
  send?: (userId: string, message: string) => Promise<void>,
  now = new Date(),
): Promise<{ warned: number }> {
  const deliver = send ?? (async (userId: string, message: string) => {
    const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
    const target = await resolveOutboundTarget(supabaseAdmin, userId);
    if (!target) throw new Error("sem canal");
    const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
    const r = await sendReplyForChannel(target.channel, target.externalId, message);
    if (!r.ok) throw new Error("envio falhou");
  });

  const { data } = await supabaseAdmin
    .from("email_connections")
    .select("id, user_id, connected_at, expires_at, reauth_warned_at")
    .eq("provider", "gmail");

  let warned = 0;
  for (const conn of ((data as any[]) ?? [])) {
    if (!shouldWarnReauth(conn, now)) continue;
    try {
      await deliver(String(conn.user_id), reauthWarningMessage(hoursUntilExpiry(conn, now)));
      await supabaseAdmin
        .from("email_connections")
        .update({ reauth_warned_at: now.toISOString() })
        .eq("id", conn.id);
      warned++;
    } catch (e) {
      console.error("[gmail-reauth] aviso falhou", e);
    }
  }
  return { warned };
}

/** Marca a ligação como caducada quando o Gmail devolve 401/403. */
export async function markGmailAuthExpired(
  supabaseAdmin: any,
  userId: string,
  reason: string,
): Promise<void> {
  await supabaseAdmin
    .from("email_connections")
    .update({ expires_at: new Date().toISOString(), last_error: reason })
    .eq("user_id", userId)
    .eq("provider", "gmail");
}
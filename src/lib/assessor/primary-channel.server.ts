// Regra de prioridade de canal.
//
// REGRA: se a conta tiver WhatsApp ligado, o WhatsApp é o canal principal
// para tudo o que o Afonso inicia (lembretes, avisos proativos, comunicação
// em massa). O Telegram é a porta de entrada do Nível 0 e só é usado quando
// não existe WhatsApp ligado.
//
// Fonte de verdade do estado: profiles.whatsapp_link_status + channel_links.
// profiles.primary_channel (e consultant_preferences.primary_channel) são
// apenas o valor materializado, recalculado sempre que um canal liga/desliga.

import { normalizePhone } from "@/lib/whatsapp/phone";

export type OutboundChannel = "whatsapp" | "telegram";

export interface ChannelAvailability {
  whatsapp: string | null; // telefone E.164 (dígitos)
  telegram: string | null; // chat_id
}

export async function loadChannelAvailability(
  supabaseAdmin: any,
  userId: string,
): Promise<ChannelAvailability> {
  const [{ data: prof }, { data: links }] = await Promise.all([
    supabaseAdmin.from("profiles").select("phone, whatsapp_link_status").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("channel_links").select("channel, external_id").eq("user_id", userId),
  ]);

  const rows = ((links as { channel: string; external_id: string }[] | null) ?? []);
  const tgRow = rows.find((r) => r.channel === "telegram");
  const waLink = rows.find((r) => r.channel === "whatsapp");

  const p = prof as { phone: string | null; whatsapp_link_status: string | null } | null;
  const waPhone =
    p?.whatsapp_link_status === "linked" && p?.phone
      ? normalizePhone(p.phone)
      : waLink
        ? normalizePhone(waLink.external_id)
        : null;

  return { whatsapp: waPhone || null, telegram: tgRow?.external_id ?? null };
}

// Recalcula e persiste o canal principal. Devolve o canal resultante.
export async function recomputePrimaryChannel(
  supabaseAdmin: any,
  userId: string,
): Promise<OutboundChannel | null> {
  const av = await loadChannelAvailability(supabaseAdmin, userId);
  const primary: OutboundChannel | null = av.whatsapp ? "whatsapp" : av.telegram ? "telegram" : null;
  if (!primary) return null;

  await supabaseAdmin.from("profiles").update({ primary_channel: primary } as never).eq("id", userId);
  await supabaseAdmin
    .from("consultant_preferences")
    .update({ primary_channel: primary } as never)
    .eq("user_id", userId);
  return primary;
}

// Alvo para mensagens iniciadas pelo Afonso. Nunca usa "o canal da última
// mensagem recebida": usa o canal principal e só cai no outro se o principal
// não estiver disponível.
export async function resolveOutboundTarget(
  supabaseAdmin: any,
  userId: string,
): Promise<{ channel: OutboundChannel; externalId: string } | null> {
  const av = await loadChannelAvailability(supabaseAdmin, userId);
  if (av.whatsapp) return { channel: "whatsapp", externalId: av.whatsapp };
  if (av.telegram) return { channel: "telegram", externalId: av.telegram };
  return null;
}

// Envio agnóstico ao canal, já com a regra de prioridade aplicada.
export async function sendOutbound(
  supabaseAdmin: any,
  userId: string,
  text: string,
): Promise<{ ok: boolean; channel: OutboundChannel | null; messageId?: string | null; error?: string }> {
  const target = await resolveOutboundTarget(supabaseAdmin, userId);
  if (!target) return { ok: false, channel: null, error: "user_not_linked" };

  if (target.channel === "whatsapp") {
    const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
    const r = await sendWhatsAppText(target.externalId, text, { triggeredBy: userId, kind: "auto" });
    return {
      ok: !!r?.ok,
      channel: "whatsapp",
      messageId: r?.ok ? (r.messageId ?? null) : null,
      error: r?.ok ? undefined : "whatsapp_send_failed",
    };
  }

  const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
  const r = await getTelegramProvider().sendText({ chatId: target.externalId, text });
  return { ok: r.ok, channel: "telegram", messageId: r.messageId ?? null, error: r.error };
}

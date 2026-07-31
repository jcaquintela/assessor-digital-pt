// Resolução de utilizador por canal + envio de resposta agnóstico ao canal.
// Fonte de verdade: tabela channel_links. Fallback WhatsApp: profiles.phone
// (compatibilidade com o pareamento legado por código LIGAR-XXXXXX).

import { normalizePhone } from "@/lib/whatsapp/phone";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { getTelegramProvider } from "@/lib/telegram/provider.server";

export type Channel = "whatsapp" | "telegram";

export async function findUserIdByChannel(
  supabaseAdmin: any,
  channel: Channel,
  externalId: string,
): Promise<string | null> {
  const normalized = channel === "whatsapp" ? normalizePhone(externalId) : externalId;
  if (!normalized) return null;

  const { data } = await supabaseAdmin
    .from("channel_links")
    .select("user_id")
    .eq("channel", channel)
    .eq("external_id", normalized)
    .maybeSingle();
  if (data?.user_id) return data.user_id as string;

  // Fallback WhatsApp: profiles.phone (fluxo antigo já validado).
  if (channel === "whatsapp") {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", normalized)
      .eq("whatsapp_link_status", "linked")
      .maybeSingle();
    const uid = (prof as { id?: string } | null)?.id ?? null;
    if (uid) {
      // Materializa em channel_links para futuras leituras.
      await supabaseAdmin
        .from("channel_links")
        .upsert(
          { user_id: uid, channel: "whatsapp", external_id: normalized },
          { onConflict: "channel,external_id" },
        );
    }
    return uid;
  }
  return null;
}

export async function linkChannelToUser(
  supabaseAdmin: any,
  channel: Channel,
  externalId: string,
  userId: string,
  displayName?: string,
): Promise<void> {
  await supabaseAdmin.from("channel_links").upsert(
    {
      user_id: userId,
      channel,
      external_id: externalId,
      display_name: displayName ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "channel,external_id" },
  );

  // Regra de prioridade: WhatsApp ganha sempre que existir.
  const { recomputePrimaryChannel } = await import("./primary-channel.server");
  await recomputePrimaryChannel(supabaseAdmin, userId);
}

export async function sendReplyForChannel(
  channel: Channel,
  externalId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (channel === "whatsapp") {
    const r = await sendWhatsAppText(externalId, text, { kind: "auto" });
    return { ok: !!r?.ok, error: r?.ok ? undefined : "whatsapp_send_failed" };
  }
  if (channel === "telegram") {
    const r = await getTelegramProvider().sendText({ chatId: externalId, text });
    return { ok: r.ok, error: r.error };
  }
  return { ok: false, error: "unsupported_channel" };
}

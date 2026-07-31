import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LinkedChannel = "whatsapp" | "telegram";

export interface LinkedChannelInfo {
  channel: LinkedChannel | null;
  externalId: string | null;
  displayName: string | null;
  linkedAt: string | null;
  loading: boolean;
  /** Todos os canais ligados a esta conta. */
  channels: {
    channel: LinkedChannel;
    externalId: string;
    displayName: string | null;
    linkedAt: string | null;
  }[];
  /** Canal principal: WhatsApp sempre que estiver ligado. */
  primary: LinkedChannel | null;
}

// Máscara do contacto: mostra só o fim. +351 ••• ••• 767 / ID Telegram ••••123.
export function maskContact(channel: LinkedChannel, externalId: string): string {
  const d = externalId.replace(/\D+/g, "");
  const tail = d.slice(-3);
  if (channel === "whatsapp") {
    const cc = d.length > 9 ? d.slice(0, d.length - 9) : "";
    return `${cc ? `+${cc} ` : "+"}••• ••• ${tail}`;
  }
  return `••••${tail}`;
}

export const CHANNEL_LABEL: Record<LinkedChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

// Canal real ligado à conta. Lê channel_links (RLS: só o próprio dono).
export function useLinkedChannel(): LinkedChannelInfo {
  const [info, setInfo] = useState<LinkedChannelInfo>({
    channel: null, externalId: null, displayName: null, linkedAt: null, loading: true,
    channels: [], primary: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { if (!cancelled) setInfo((s) => ({ ...s, loading: false })); return; }
      const [{ data }, { data: prof }] = await Promise.all([
        supabase
          .from("channel_links")
          .select("channel, external_id, display_name, linked_at")
          .eq("user_id", userData.user.id)
          .order("linked_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("phone, whatsapp_link_status, whatsapp_linked_at")
          .eq("id", userData.user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const rows = (data ?? []) as
        { channel: string; external_id: string; display_name: string | null; linked_at: string }[];
      const channels = rows
        .filter((r) => r.channel === "whatsapp" || r.channel === "telegram")
        .map((r) => ({
          channel: r.channel as LinkedChannel,
          externalId: r.external_id,
          displayName: r.display_name,
          linkedAt: r.linked_at,
        }));
      // Contas antigas podem ter WhatsApp só em profiles (antes de channel_links).
      const p = prof as { phone: string | null; whatsapp_link_status: string | null; whatsapp_linked_at: string | null } | null;
      if (p?.whatsapp_link_status === "linked" && p.phone && !channels.some((c) => c.channel === "whatsapp")) {
        channels.unshift({
          channel: "whatsapp",
          externalId: p.phone,
          displayName: null,
          linkedAt: p.whatsapp_linked_at,
        });
      }
      // Regra de prioridade: WhatsApp ligado ⇒ WhatsApp é o principal.
      const primary: LinkedChannel | null = channels.some((c) => c.channel === "whatsapp")
        ? "whatsapp"
        : channels.length
          ? "telegram"
          : null;
      const main = channels.find((c) => c.channel === primary) ?? channels[0];
      setInfo({
        channel: main?.channel ?? null,
        externalId: main?.externalId ?? null,
        displayName: main?.displayName ?? null,
        linkedAt: main?.linkedAt ?? null,
        loading: false,
        channels,
        primary,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return info;
}

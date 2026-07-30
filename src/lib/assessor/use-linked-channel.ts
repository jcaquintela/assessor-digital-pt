import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LinkedChannel = "whatsapp" | "telegram";

export interface LinkedChannelInfo {
  channel: LinkedChannel | null;
  externalId: string | null;
  displayName: string | null;
  linkedAt: string | null;
  loading: boolean;
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
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { if (!cancelled) setInfo((s) => ({ ...s, loading: false })); return; }
      const { data } = await supabase
        .from("channel_links")
        .select("channel, external_id, display_name, linked_at")
        .eq("user_id", userData.user.id)
        .order("linked_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0] as
        | { channel: string; external_id: string; display_name: string | null; linked_at: string }
        | undefined;
      setInfo({
        channel: row ? ((row.channel === "telegram" ? "telegram" : "whatsapp") as LinkedChannel) : null,
        externalId: row?.external_id ?? null,
        displayName: row?.display_name ?? null,
        linkedAt: row?.linked_at ?? null,
        loading: false,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return info;
}

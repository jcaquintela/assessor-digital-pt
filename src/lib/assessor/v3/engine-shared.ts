// Pequenos auxiliares partilhados pelo motor v3 e pelos módulos extraídos
// (sparring, pendentes). Não têm estado nem tocam na base de dados.

import { lisbonYmd } from "../lisbon-day";

export const HISTORY_LIMIT = 6;

export function nowLisbonHuman(): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

export function nowLisbonYmd(): string {
  return lisbonYmd(new Date());
}

export function toHistoryPreview(
  rows: Array<{ role: string; content: string; channel?: string | null }>,
  currentChannel?: string,
): string {
  // Conversa partilhada: mensagens de OUTRO canal levam a origem, para o
  // modelo saber onde cada coisa foi dita. Do canal atual: formato antigo.
  const label = (c?: string | null) =>
    c === "whatsapp" ? "WhatsApp" : c === "telegram" ? "Telegram" : c ?? "";
  return [...rows].reverse()
    .filter((r) => r?.content && (r.role === "user" || r.role === "assistant"))
    .slice(-HISTORY_LIMIT)
    .map((r) => {
      const who = r.role === "user" ? "consultor" : "assessor";
      const other = currentChannel && r.channel && r.channel !== currentChannel;
      return `${who}${other ? ` (no ${label(r.channel)})` : ""}: ${r.content}`;
    })
    .join("\n");
}

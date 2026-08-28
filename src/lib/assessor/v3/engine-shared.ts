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

export function toHistoryPreview(rows: Array<{ role: string; content: string }>): string {
  return [...rows].reverse()
    .filter((r) => r?.content && (r.role === "user" || r.role === "assistant"))
    .slice(-HISTORY_LIMIT)
    .map((r) => `${r.role === "user" ? "consultor" : "assessor"}: ${r.content}`)
    .join("\n");
}

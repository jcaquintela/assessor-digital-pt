// Guião de Objeções: 10 minutos antes de uma reunião de ANGARIAÇÃO, o Afonso
// manda sozinho o guião das objeções mais prováveis, com o contexto real da
// pessoa e do imóvel ligados ao compromisso.
//
// Ficheiro puro (sem I/O): decide o que é uma reunião de angariação, quando
// dispara e como se escreve o guião. O runner vive em
// `objection-guide.server.ts` — mesmo padrão da Cartela de Briefing.

import { boldWa } from "../culture/whatsapp-format";
import { eventStartMs, timePt, type BriefingEvent } from "./meeting-briefing";

export const GUIDE_LEAD_MINUTES = 10;
/** Tolerância para trás: cobre corridas atrasadas sem mandar tarde demais. */
export const GUIDE_GRACE_MINUTES = 4;

export interface GuideEvent extends BriefingEvent {
  notes?: string | null;
  related_property_id?: string | null;
  objection_guide_sent_at?: string | null;
}

export interface GuideContext {
  personName?: string | null;
  propertyTitle?: string | null;
  askingPrice?: number | null;
  lastInteraction?: string | null;
}

const CLOSED = new Set(["concluído", "concluido", "cancelado", "arquivado"]);

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Uma reunião de angariação (ou avaliação/captação, que é o mesmo momento). */
export function isAngariacaoMeeting(ev: GuideEvent): boolean {
  const hay = `${norm(ev.title)} ${norm(ev.type)} ${norm(ev.notes)}`;
  return /\bangaria|\bcapta[c]?ao|\bavaliacao\s+(de\s+)?(imovel|casa|apartamento|moradia)|\bcma\b|\bacm\b/.test(
    hay,
  );
}

/** Está dentro da janela dos próximos 10 minutos (com tolerância)? */
export function isGuideDue(ev: GuideEvent, nowMs: number): boolean {
  if (ev.objection_guide_sent_at) return false;
  if (CLOSED.has(norm(ev.status))) return false;
  if (!isAngariacaoMeeting(ev)) return false;
  const start = eventStartMs(ev);
  if (!Number.isFinite(start)) return false;
  const delta = start - nowMs;
  return delta <= GUIDE_LEAD_MINUTES * 60_000 && delta >= -GUIDE_GRACE_MINUTES * 60_000;
}

function euro(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Guião de objeções. Determinístico: as quatro objeções que aparecem sempre
 * numa angariação, adaptadas ao contexto que existe em memória.
 */
export function formatObjectionGuide(
  ev: GuideEvent,
  ctx: GuideContext,
  nowMs: number,
): string {
  const start = eventStartMs(ev);
  const minutes = Math.max(1, Math.round((start - nowMs) / 60_000));
  const who = String(ctx.personName ?? "").trim();
  const head =
    `Daqui a ${minutes} min: ${boldWa(String(ev.title).trim())}` +
    (who ? `, com ${boldWa(who)}` : "") +
    (Number.isFinite(start) ? ` (${timePt(start)}).` : ".");

  const ctxLines: string[] = [];
  const prop = String(ctx.propertyTitle ?? "").trim();
  if (prop) {
    const price = euro(ctx.askingPrice ?? null);
    ctxLines.push(`Imóvel: ${prop}${price ? ` · pedido ${price}` : ""}`);
  }
  const last = String(ctx.lastInteraction ?? "").trim();
  if (last) ctxLines.push(`Última conversa: ${last}`);

  const owner = who || "o proprietário";
  const priceRef = euro(ctx.askingPrice ?? null);

  const guide = [
    `${boldWa("Guião de objeções")}`,
    `1. "A comissão é alta." → Não vendes percentagem, vendes resultado líquido. Pergunta: "quanto quer receber no fim?" e mostra o que entra no serviço.`,
    `2. "Não quero exclusividade." → Explica que a exclusividade é o que te permite investir na promoção. Propõe prazo curto com revisão.`,
    `3. "A minha casa vale mais."${priceRef ? ` (referência atual: ${priceRef})` : ""} → Não discutas o valor: mostra comparáveis e o custo de estar meses acima do mercado.`,
    `4. "Vou pensar / vou tentar sozinho." → Aceita sem pressão e fecha o próximo passo com data: "posso ligar-lhe na quinta às 10h?".`,
    ``,
    `Fecha sempre com um compromisso concreto de ${owner} — data, documento ou visita.`,
  ].join("\n");

  return [head, ctxLines.join("\n"), guide].filter(Boolean).join("\n\n");
}
// Diagnóstico de procura de uma angariação (puro).
//
// - 0 visitas em semanas = problema de geração de procura, não de negociação.
// - O funil (impressões → cliques → contactos → visitas) só é lido com
//   números reais; sem eles diz-se exatamente o que falta.
// - Uma diferença de preço face ao concorrente NUNCA prova competitividade.
// - Preços vistos noutros sítios ficam "por verificar" até uma ferramenta os
//   confirmar; divergências viram uma tarefa de verificação, não um facto.

import type { ListingBrief } from "./listing-brief";

export const eur = (n: number) => `${Math.round(n).toLocaleString("pt-PT")} €`;

/** Referências indicativas para ler o funil (não são verdades de mercado). */
export const FUNNEL_REF = { minCtr: 0.01, minLeadRate: 0.02 } as const;

export type FunnelBreak = "reach" | "listing_click" | "listing_convert" | "follow_up" | "unknown" | "none";

export interface FunnelReading {
  demandProblem: boolean;
  breakAt: FunnelBreak;
  lines: string[];
  missing: string[];
}

export function readFunnel(b: ListingBrief): FunnelReading {
  const lines: string[] = [];
  const missing: string[] = [];
  const weeks = b.weeksOnMarket;
  const demandProblem = b.visits === 0 && (weeks == null || weeks >= 3);
  if (demandProblem) {
    lines.push(weeks
      ? `0 visitas em ${weeks} semanas é um problema de *geração de procura*, não de negociação: o anúncio não está a trazer compradores.`
      : "0 visitas é um problema de *geração de procura*: o anúncio não está a trazer compradores.");
  }
  if (b.impressions == null) missing.push("impressões");
  if (b.clicks == null) missing.push("cliques");
  if (b.leads == null) missing.push("pedidos de contacto");

  let breakAt: FunnelBreak = "unknown";
  if (b.impressions != null && b.clicks != null) {
    const ctr = b.impressions > 0 ? b.clicks / b.impressions : 0;
    if (b.impressions < 500) {
      breakAt = "reach";
      lines.push(`Funil: ${b.impressions} impressões é pouco alcance — o problema começa antes do anúncio (exposição).`);
    } else if (ctr < FUNNEL_REF.minCtr) {
      breakAt = "listing_click";
      lines.push(`Funil: ${b.impressions} impressões e ${b.clicks} cliques (${(ctr * 100).toFixed(1)}%) — vê-se mas não se abre: foto principal, título e preço na listagem.`);
    } else if (b.leads != null) {
      const rate = b.clicks > 0 ? b.leads / b.clicks : 0;
      if (rate < FUNNEL_REF.minLeadRate) {
        breakAt = "listing_convert";
        lines.push(`Funil: ${b.clicks} cliques e ${b.leads} contactos — abre-se mas não convence: fotos, descrição ou preço face ao que aparece ao lado.`);
      } else if ((b.visits ?? 0) === 0) {
        breakAt = "follow_up";
        lines.push(`Funil: ${b.leads} contactos e 0 visitas — a procura existe; falha a resposta/qualificação dos contactos.`);
      } else {
        breakAt = "none";
        lines.push("Funil sem quebra evidente nos números que me deste.");
      }
    }
    lines.push("_Limiares indicativos (1% de cliques, 2% de contactos), não verdades de mercado._");
  } else {
    lines.push(`Sem ${missing.join(", ")} do portal não sei em que ponto o funil parte — é o primeiro número a ir buscar.`);
  }
  if (b.colleagueContacts) {
    lines.push(`Os ${b.colleagueContacts} contactos de colegas são procura indireta: pede-lhes o perfil do comprador e o feedback de preço.`);
  }
  return { demandProblem, breakAt, lines, missing };
}

export interface VerifiedSighting { url: string; host: string; price: number | null; seenAt: string }

export interface PriceCheck { discrepancy: boolean; line: string | null }

/** Preço informado vs. outros valores (do consultor ou vistos por ferramenta). */
export function checkPrice(b: ListingBrief, opts: { ownRecordPrice?: number | null; sightings?: VerifiedSighting[] } = {}): PriceCheck {
  const asked = b.askingPrice;
  if (asked == null) return { discrepancy: false, line: "Preço pedido por confirmar." };
  const notes: string[] = [];
  if (b.elsewherePrice != null && b.elsewherePrice !== asked) {
    notes.push(`referes ${eur(b.elsewherePrice)} noutros portais (não verificado por mim)`);
  }
  if (opts.ownRecordPrice != null && opts.ownRecordPrice !== asked) {
    notes.push(`na tua carteira está ${eur(opts.ownRecordPrice)}`);
  }
  for (const s of opts.sightings ?? []) {
    if (s.price != null && s.price !== asked) notes.push(`em ${s.host} aparece ${eur(s.price)} (visto a ${s.seenAt}: ${s.url})`);
  }
  if (!notes.length) return { discrepancy: false, line: null };
  return {
    discrepancy: true,
    line: `*Preço divergente:* disseste ${eur(asked)}, mas ${notes.join("; ")}. Confirma qual está publicado em cada portal antes de mexer em mais nada — preços diferentes afastam compradores. Até lá trabalho com ${eur(asked)} como "informado por ti".`,
  };
}

/** Anúncio do concorrente lido por ferramenta (site público zome.pt). */
export interface VerifiedCompetitor { url: string; price: number | null; areaM2: number | null; seenAt: string }

export function compareCompetitor(b: ListingBrief, verified: VerifiedCompetitor | null = null): string | null {
  if (!b.competitorRef) return null;
  const head = `*Concorrente ${b.competitorRef}:*`;
  if (verified && verified.price != null) {
    const facts = [eur(verified.price), verified.areaM2 ? `${verified.areaM2} m² úteis` : null].filter(Boolean).join(" · ");
    const said = b.competitorPrice != null && b.competitorPrice !== verified.price ? ` (disseste ${eur(b.competitorPrice)})` : "";
    if (b.askingPrice == null) return `${head} ${facts} no site público zome.pt (lido a ${verified.seenAt})${said}: ${verified.url}. Sem o teu preço não comparo.`;
    const diff = b.askingPrice - verified.price;
    const dir = diff > 0 ? `o teu está ${eur(diff)} acima` : diff < 0 ? `o teu está ${eur(-diff)} abaixo` : "mesmo preço";
    const perM2 = b.areaM2 && verified.areaM2 ? ` Por m²: ${eur(b.askingPrice / b.areaM2)} vs ${eur(verified.price / verified.areaM2)}.` : "";
    return `${head} ${facts} no site público zome.pt (lido a ${verified.seenAt})${said}: ${verified.url} — ${dir}.${perM2} Isto sozinho não prova que o teu está caro ou competitivo: falta comparar terreno, estado e localização exata.`;
  }
  if (b.competitorPrice == null || b.askingPrice == null) {
    return `${head} sem o anúncio não tenho preço, área nem estado verificados, por isso não comparo. Manda-me o link e eu cruzo.`;
  }
  const diff = b.askingPrice - b.competitorPrice;
  const dir = diff > 0 ? `o teu está ${eur(diff)} acima` : diff < 0 ? `o teu está ${eur(-diff)} abaixo` : "mesmo preço";
  const perM2 = b.areaM2 && b.competitorAreaM2
    ? ` Por m²: ${eur(b.askingPrice / b.areaM2)} vs ${eur(b.competitorPrice / b.competitorAreaM2)}.`
    : "";
  return `${head} ${eur(b.competitorPrice)} (dito por ti, por verificar) — ${dir}.${perM2} Isto sozinho não prova que o teu está caro ou competitivo: falta comparar área, terreno, estado e localização exata.`;
}

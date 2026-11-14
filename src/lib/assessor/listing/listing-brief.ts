// Angariação com pouca procura — extração determinística dos factos.
//
// Tudo o que vem da mensagem é "dito pelo consultor"; preços vistos noutros
// sítios ficam sempre "por verificar" até uma ferramenta os confirmar.

import { foldText } from "@/lib/search/normalize";

export interface ListingBrief {
  ref: string | null;
  competitorRef: string | null;
  exclusive: boolean;
  propertyType: string | null;
  typology: string | null;
  zone: string | null;
  /** Preço que o consultor diz estar pedido. */
  askingPrice: number | null;
  /** Preço que o consultor diz ter visto noutro portal (não verificado). */
  elsewherePrice: number | null;
  competitorPrice: number | null;
  areaM2: number | null;
  competitorAreaM2: number | null;
  weeksOnMarket: number | null;
  visits: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  colleagueContacts: number | null;
  organic: boolean;
  paidMargin: boolean;
  features: string[];
}

const ZMPT_RE = /\bZMPT[-\s]?(\d{4,})\b/gi;
const WORD_NUM: Record<string, number> = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const NUM = String.raw`(\d+(?:[.\s]\d{3})*|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)`;

function toNum(s: string | undefined): number | null {
  if (s == null) return null;
  const w = WORD_NUM[foldText(s)];
  if (w != null) return w;
  const n = Number(s.replace(/[.\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface PriceHit { value: number; index: number }

function priceHits(text: string): PriceHit[] {
  const out: PriceHit[] = [];
  const re = /(\d{2,3}(?:[.\s]\d{3})+|\d{2,4})\s*(k\b|mil\b|€|euros?\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1]!.replace(/[.\s]/g, "");
    let v = Number(raw);
    const unit = m[2]!.toLowerCase();
    if (unit === "k" || unit === "mil") v *= 1000;
    if (v >= 30_000 && v <= 20_000_000) out.push({ value: v, index: m.index });
  }
  return out;
}

const FEATURES: Array<[RegExp, string]> = [
  [/\bpiscina\b/, "piscina"], [/\bjardim\b/, "jardim"], [/\bgaragem\b/, "garagem"],
  [/\bterreno\b|\blote\b/, "terreno"], [/\bvista (?:mar|rio)\b/, "vista"], [/\bterraco\b/, "terraço"],
  [/\bsuite\b/, "suite"], [/\bbarbecue\b|\bchurrasqueira\b/, "churrasqueira"],
  [/\bpaineis solares\b|\bpainel solar\b/, "painéis solares"], [/\bremodelad[ao]\b|\brenovad[ao]\b/, "remodelada"],
  [/\bpraia\b/, "perto da praia"],
];

const SIGNAL_RE =
  /\b(angaria(?:cao|coes|do|da)|exclusiv[oa]|tenho (?:em|a) venda|imovel (?:meu|que tenho)|o meu imovel|a minha moradia|o meu apartamento)\b/;
// Só sinais de PROBLEMA de procura — "marca visita à angariação" não entra.
const DEMAND_RE =
  /\b(?:(?:sem|zero|0|nenhuma|poucas|so \d+) visitas?|sem procura|sem contactos|nao (?:sai|vende|mexe|aparece ninguem)|parad[oa]|(?:\d+|varias|ha) (?:semanas|meses)(?: (?:no mercado|sem|a venda|e nada))?|impressoes|visualizacoes|cliques)\b/;
const BUYER_RE = /\b(comprador|quer comprar|pre-?aprovacao)\b/;

/** Pedido de diagnóstico de uma angariação (não de um comprador). */
export function isListingDiagnosis(text: string): boolean {
  const t = foldText(text);
  if (BUYER_RE.test(t)) return false;
  return SIGNAL_RE.test(t) && DEMAND_RE.test(t);
}

function zoneOf(text: string): string | null {
  const name = String.raw`[A-ZÀ-Ý][\wÀ-ÿ'-]+(?:\s+(?:e|de|da|do|dos|das)\s+[A-ZÀ-Ý][\wÀ-ÿ'-]+)*`;
  const afterTyp = new RegExp(String.raw`\bT\s?\d\b\s+(?:em\s+|na\s+|no\s+)?(${name})`).exec(text);
  if (afterTyp) return afterTyp[1]!;
  const afterEm = new RegExp(String.raw`\b(?:em|na|no)\s+(${name})`).exec(text);
  return afterEm ? afterEm[1]! : null;
}

export function extractListingBrief(text: string): ListingBrief {
  const raw = String(text ?? "");
  const t = foldText(raw);

  const refs = [...raw.matchAll(ZMPT_RE)].map((m) => ({ ref: `ZMPT${m[1]}`, index: m.index ?? 0 }));
  const competitorIdx = refs.findIndex((r) => /concorr|rival|outr[oa] (?:imovel|moradia|angariacao)/.test(foldText(raw.slice(Math.max(0, r.index - 40), r.index))));
  const competitor = competitorIdx >= 0 ? refs[competitorIdx]! : refs.length > 1 ? refs[1]! : null;
  const own = refs.find((r) => r !== competitor) ?? null;

  let askingPrice: number | null = null;
  let elsewherePrice: number | null = null;
  let competitorPrice: number | null = null;
  for (const h of priceHits(raw)) {
    const before = foldText(raw.slice(Math.max(0, h.index - 50), h.index));
    const nearCompetitor = competitor && h.index > competitor.index && h.index - competitor.index < 60;
    if (nearCompetitor || /concorr/.test(before)) competitorPrice ??= h.value;
    else if (/portais?|idealista|imovirtual|supercasa|sapo|anuncio|aparece|noutr[oa]s?|outr[oa]s? sites?/.test(before) && askingPrice != null) elsewherePrice ??= h.value;
    else askingPrice ??= h.value;
  }
  // "aparece a 455k noutros portais" (o sinal vem depois do preço).
  if (elsewherePrice == null) {
    for (const h of priceHits(raw)) {
      if (h.value === askingPrice || h.value === competitorPrice) continue;
      const after = foldText(raw.slice(h.index, h.index + 40));
      if (/noutr[oa]s?|portais?|idealista|imovirtual|outr[oa]s? sites?/.test(after)) { elsewherePrice = h.value; break; }
    }
  }

  const areas = [...raw.matchAll(/(\d{2,4})\s*(?:m2|m²|metros quadrados)/gi)].map((m) => ({ v: Number(m[1]), index: m.index ?? 0 }));
  const ownArea = areas.find((a) => !(competitor && a.index > competitor.index && a.index - competitor.index < 80)) ?? null;
  const compArea = areas.find((a) => competitor && a.index > competitor.index && a.index - competitor.index < 80) ?? null;

  const weeks = t.match(new RegExp(`${NUM}\\s+semanas`));
  const months = t.match(new RegExp(`${NUM}\\s+mes(?:es)?`));
  const visitsM = t.match(new RegExp(`${NUM}\\s+visitas?`));
  const noVisits = /\b(sem|nenhuma|zero|0)\s+visitas?\b/.test(t);
  const contacts = t.match(new RegExp(`${NUM}\\s+contactos?(?:[^.]{0,30}colegas|\\s+de\\s+colegas)`));
  const impressions = t.match(new RegExp(`${NUM}\\s+(?:impressoes|visualizacoes)`));
  const clicks = t.match(new RegExp(`${NUM}\\s+cliques`));
  const leads = t.match(new RegExp(`${NUM}\\s+(?:leads|pedidos(?: de contacto)?)`));
  const typ = t.match(/\bt\s?([0-9])\b/);
  const type = t.match(/\b(moradia|apartamento|terreno|loja|quinta|duplex)\b/);

  return {
    ref: own?.ref ?? null,
    competitorRef: competitor?.ref ?? null,
    exclusive: /\bexclusiv/.test(t),
    propertyType: type ? type[1]! : null,
    typology: typ ? `T${typ[1]}` : null,
    zone: zoneOf(raw),
    askingPrice,
    elsewherePrice: elsewherePrice != null && elsewherePrice !== askingPrice ? elsewherePrice : null,
    competitorPrice,
    areaM2: ownArea?.v ?? null,
    competitorAreaM2: compArea?.v ?? null,
    weeksOnMarket: weeks ? toNum(weeks[1]) : months ? Math.round((toNum(months[1]) ?? 0) * 4.3) || null : null,
    visits: noVisits ? 0 : visitsM ? toNum(visitsM[1]) : null,
    impressions: impressions ? toNum(impressions[1]) : null,
    clicks: clicks ? toNum(clicks[1]) : null,
    leads: leads ? toNum(leads[1]) : null,
    colleagueContacts: contacts ? toNum(contacts[1]) : null,
    organic: /\borganic/.test(t),
    paidMargin: /\b(margem (?:paga|para pago)|pago|patrocinad|ads\b|anuncios pagos|campanha paga|orcamento para (?:anuncios|publicidade))/.test(t),
    features: FEATURES.filter(([re]) => re.test(t)).map(([, f]) => f),
  };
}

/** Junta factos de várias mensagens; o mais recente ganha, nada se perde. */
export function mergeListingBriefs(list: ListingBrief[]): ListingBrief {
  const out = extractListingBrief("");
  for (const b of list) {
    for (const k of Object.keys(b) as Array<keyof ListingBrief>) {
      const v = b[k];
      if (k === "features") { out.features = Array.from(new Set([...out.features, ...b.features])); continue; }
      if (typeof v === "boolean") { if (v) (out as any)[k] = true; continue; }
      if (v != null) (out as any)[k] = v;
    }
  }
  return out;
}

/** Sabemos de que imóvel se trata? */
export function hasListingIdentity(b: ListingBrief): boolean {
  return !!(b.ref || ((b.typology || b.propertyType) && b.zone));
}

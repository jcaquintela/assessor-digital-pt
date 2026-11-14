// Propostas de imóveis ao consultor — formato único e verificável.
//
// Regras duras:
// - Sem link real (vindo de uma pesquisa feita neste turno ou da carteira
//   própria) o imóvel não é proposto.
// - Cada campo não verificado aparece como "por confirmar". Nunca se inventa.
// - Nunca há imagens: um anúncio não traz fotografia verificada do imóvel.

import { foldText } from "@/lib/search/normalize";
import type { BuyerBrief } from "./buyer-brief";

export const APP_BASE_URL = "https://app.meuafonso.com";
export const UNVERIFIED = "por confirmar";

// "portal" inclui o site público zome.pt: é um anúncio publicado, não a
// carteira interna da Rede.
export type ProposalSource = "carteira_propria" | "portal" | "referencia_consultor";

export interface ListingProposal {
  url: string;
  source: ProposalSource;
  /** "Carteira própria", "idealista.pt", ... */
  sourceLabel: string;
  title: string;
  zmptRef: string | null;
  price: number | null;
  typology: string | null;
  location: string | null;
  /** Só preenchido quando verificado. */
  metroDistance: string | null;
  /** Estado verificado (carteira própria) ou null = por confirmar. */
  availability: string | null;
  matchReasons: string[];
  /** Avisos honestos ("acima do teto assumido"). */
  caveats: string[];
  /** Características lidas do próprio anúncio/registo (área, garagem, ...). */
  features?: string[];
  /** Portais: dia em que o preço foi visto (dd/mm). O preço pode ter mudado. */
  seenAt?: string | null;
  /** Portais: "page" = lido na página do anúncio; senão só no resultado da pesquisa. */
  verification?: "page" | "search_result";
  /** Área útil em m², quando lida (serve também para deduplicar). */
  areaM2?: number | null;
  /** O mesmo imóvel noutras fontes (links reais, deduplicados). */
  alsoAt?: Array<{ url: string; sourceLabel: string }>;
}

const FEATURE_RES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/(\d{2,4})\s*(?:m2|m²)/i, (m) => `${m[1]} m²`],
  [/\bgaragem\b/i, () => "garagem"], [/\belevador\b/i, () => "elevador"],
  [/\bvaranda\b/i, () => "varanda"], [/\bterra[çc]o\b/i, () => "terraço"],
  [/\bremodelad[oa]\b|\brenovad[oa]\b/i, () => "remodelado"],
];

/** Características explícitas no texto do anúncio — nunca deduzidas. */
export function parseFeatures(...texts: Array<string | null | undefined>): string[] {
  const t = texts.filter(Boolean).join(" ");
  const out: string[] = [];
  for (const [re, f] of FEATURE_RES) { const m = t.match(re); if (m) out.push(f(m)); }
  return out;
}

const ZMPT_RE = /\bZMPT[-\s]?\d{3,}\b/i;

export function findZmptRef(...texts: Array<string | null | undefined>): string | null {
  for (const t of texts) {
    const m = String(t ?? "").match(ZMPT_RE);
    if (m) return m[0].toUpperCase().replace(/\s/g, "-");
  }
  return null;
}

/** Preço num título/descrição de anúncio ("145.000 €", "145 000€", "145 mil euros"). */
export function parseListingPrice(text: string | null | undefined): number | null {
  const t = String(text ?? "");
  const m = t.match(/(\d{2,3}(?:[.\s\u00a0]\d{3})+)\s*(?:€|eur|euros)/i) ?? t.match(/€\s*(\d{2,3}(?:[.\s\u00a0]\d{3})+)/i);
  if (m) return Number(m[1]!.replace(/[.\s\u00a0]/g, ""));
  const k = t.match(/(\d{2,3})\s*mil\s*(?:€|euros)/i);
  return k ? Number(k[1]) * 1000 : null;
}

export function parseListingTypology(text: string | null | undefined): string | null {
  const m = foldText(text).match(/\bt\s?([0-6])\b/);
  return m ? `T${m[1]}` : null;
}

function within(brief: BuyerBrief, p: Pick<ListingProposal, "price" | "typology" | "location">): { reasons: string[]; caveats: string[] } {
  const reasons: string[] = [];
  const caveats: string[] = [];
  if (brief.typology && p.typology) {
    if (foldText(p.typology) === foldText(brief.typology.value)) reasons.push(`${p.typology} como pedido`);
    else caveats.push(`tipologia ${p.typology}, pediu ${brief.typology.value}`);
  }
  if (brief.zone && p.location && foldText(p.location).includes(foldText(brief.zone.value))) {
    reasons.push(`em ${brief.zone.value}`);
  }
  if (brief.budgetMax && p.price != null) {
    const assumed = brief.budgetMax.status === "assumed";
    const stretch = assumed ? brief.budget?.guarantee ?? null : null;
    if (p.price <= brief.budgetMax.value) reasons.push(assumed ? "dentro do orçamento provisório" : "dentro do orçamento");
    else if (stretch != null && p.price <= stretch) caveats.push("acima do orçamento provisório a 90%; só cabe com garantia pública (decide o banco)");
    else caveats.push(assumed ? "acima do orçamento provisório" : "acima do orçamento");
  }
  return { reasons, caveats };
}

export interface InternalPropertyRow {
  id: string;
  title: string | null;
  typology: string | null;
  location: string | null;
  city: string | null;
  asking_price: number | null;
  status: string | null;
  notes?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  disponivel: "disponível", available: "disponível", ativo: "disponível", active: "disponível",
  reservado: "reservado", reserved: "reservado", vendido: "vendido", sold: "vendido",
};

export function fromInternalProperty(row: InternalPropertyRow, brief: BuyerBrief): ListingProposal {
  const location = [row.location, row.city].filter(Boolean).join(", ") || null;
  const base = { price: row.asking_price ?? null, typology: row.typology ?? null, location };
  const { reasons, caveats } = within(brief, base);
  return {
    url: `${APP_BASE_URL}/imoveis/${row.id}`,
    source: "carteira_propria",
    sourceLabel: "Carteira própria",
    title: row.title || "Imóvel",
    zmptRef: findZmptRef(row.title, row.notes),
    ...base,
    metroDistance: null,
    availability: row.status ? STATUS_LABEL[foldText(row.status)] ?? row.status : null,
    matchReasons: reasons,
    caveats,
    features: parseFeatures(row.title, row.notes),
  };
}

export interface PortalListing {
  url: string; title: string; description?: string | null; host: string;
  /** Factos já lidos por uma ferramenta (ex.: URL/página zome.pt). Ganham ao texto. */
  ref?: string | null; price?: number | null; typology?: string | null; location?: string | null;
  areaM2?: number | null; verification?: "page" | "search_result"; sourceLabel?: string;
  /** Estado lido na página do anúncio (nunca deduzido). */
  status?: "vendido" | "reservado" | "publicado" | null;
}

export function fromPortalListing(l: PortalListing, brief: BuyerBrief, seenAt: string | null = null): ListingProposal {
  const text = `${l.title} ${l.description ?? ""}`;
  const location = l.location ?? (brief.zone && foldText(text).includes(foldText(brief.zone.value)) ? brief.zone.value : null);
  const base = { price: l.price ?? parseListingPrice(text), typology: l.typology ?? parseListingTypology(text), location };
  const { reasons, caveats } = within(brief, base);
  if (l.status === "reservado") caveats.push("reservado no anúncio");
  const features = parseFeatures(l.title, l.description);
  if (l.areaM2 != null && !features.some((f) => /m²$/.test(f))) features.unshift(`${l.areaM2} m²`);
  return {
    url: l.url,
    source: "portal",
    sourceLabel: l.sourceLabel ?? l.host,
    title: l.title || "Anúncio",
    zmptRef: l.ref ?? findZmptRef(l.title, l.description, l.url),
    ...base,
    metroDistance: null,
    // Um resultado de pesquisa não prova que o anúncio ainda está ativo;
    // só a página lida dá o estado publicado (e mesmo assim sem negociação).
    availability: l.status && l.status !== "vendido" ? l.status : null,
    matchReasons: reasons,
    caveats,
    features,
    seenAt,
    verification: l.verification ?? "search_result",
    areaM2: l.areaM2 ?? areaOf(features),
  };
}

function areaOf(features: string[]): number | null {
  const f = features.find((x) => /m²$/.test(x));
  return f ? Number(f.replace(/\D/g, "")) || null : null;
}

function money(n: number | null): string {
  return n == null ? `preço ${UNVERIFIED}` : `${Math.round(n).toLocaleString("pt-PT")} €`;
}

/** Bloco de uma proposta, em sintaxe WhatsApp. Devolve null sem link real. */
export function formatProposal(p: ListingProposal, index: number): string | null {
  if (!/^https?:\/\//.test(p.url)) return null;
  const seen = p.source === "portal" && p.price != null && p.seenAt
    ? p.verification === "page" ? ` (verificado no anúncio a ${p.seenAt})` : ` (visto na pesquisa a ${p.seenAt}; confirma no anúncio)`
    : "";
  const head = `${index}. *${p.title}* — ${money(p.price)}${seen}`;
  const facts = [
    `Tipologia: ${p.typology ?? UNVERIFIED}`,
    `Local: ${p.location ?? UNVERIFIED}`,
  ].join(" · ");
  const origin = [`Origem: ${p.sourceLabel}`, p.zmptRef ? `Ref. ${p.zmptRef}` : null].filter(Boolean).join(" · ");
  const status = [
    `Metro: ${p.metroDistance ?? UNVERIFIED}`,
    `Estado: ${!p.availability ? UNVERIFIED
      : p.source === "carteira_propria" ? `${p.availability} (verificado na tua carteira)`
      : `${p.availability} no anúncio${p.seenAt ? ` a ${p.seenAt}` : ""} (negociação por confirmar)`}`,
  ].join(" · ");
  const feats = `Características: ${p.features?.length ? p.features.join(", ") : UNVERIFIED}`;
  const why = p.matchReasons.length ? `Porquê: ${p.matchReasons.join(", ")}.` : "Porquê: critérios por confirmar.";
  const warn = p.caveats.length ? `_Atenção: ${p.caveats.join("; ")}._` : null;
  const also = p.alsoAt?.length ? `   Também em: ${p.alsoAt.map((a) => `${a.sourceLabel} ${a.url}`).join(" · ")}` : null;
  return [head, `   ${facts}`, `   ${feats}`, `   ${origin}`, `   ${status}`, `   ${why}`, warn ? `   ${warn}` : null, `   ${p.url}`, also]
    .filter(Boolean).join("\n");
}

/**
 * Ranking NEUTRO por compatibilidade: menos avisos, mais razões de encaixe,
 * mais campos verificados, preço mais baixo, e por fim o URL (determinístico).
 * A fonte (portal, zome.pt, ...) nunca entra na ordem.
 */
export function rankProposals(list: ListingProposal[]): ListingProposal[] {
  const verified = (p: ListingProposal) => [p.price, p.typology, p.location, p.areaM2].filter((x) => x != null).length;
  return [...list].sort((a, b) =>
    a.caveats.length - b.caveats.length ||
    b.matchReasons.length - a.matchReasons.length ||
    verified(b) - verified(a) ||
    (a.price ?? Infinity) - (b.price ?? Infinity) ||
    (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

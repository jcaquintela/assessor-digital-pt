// Comparáveis de mercado — lógica pura (sem rede, sem BD).
//
// Regra de ouro: isto NÃO é uma avaliação. O Afonso mostra anúncios
// semelhantes publicados agora e diz sempre que é só referência rápida.
// Nunca "vale X", nunca "o valor de mercado é Y".

export const LISTING_DOMAINS = [
  "idealista.pt",
  "imovirtual.com",
  "casa.sapo.pt",
  "supercasa.pt",
  "remax.pt",
  "era.pt",
  "century21.pt",
  "kwportugal.pt",
  "bpiexpressoimobiliario.pt",
] as const;

export const SIMILAR_FRAMING =
  "Encontrei estes anúncios semelhantes atualmente publicados — não é uma avaliação, é só referência rápida.";

export const SIMILAR_MAX_PER_DAY = 10;
export const SIMILAR_CACHE_HOURS = 24;

export interface PropertyBrief {
  typology?: string | null;
  location?: string | null;
  city?: string | null;
  property_type?: string | null;
  asking_price?: number | null;
  title?: string | null;
}

export interface SimilarListing {
  url: string;
  title: string;
  description?: string | null;
  host: string;
}

export interface QueryPlan {
  canSearch: boolean;
  /** Falta zona e tipologia: o Afonso pergunta em vez de pesquisar. */
  missing: string[];
  /** Só um dos dois campos: pesquisa na mesma, mas avisa. */
  partial: boolean;
  query: string;
  zone: string | null;
  typology: string | null;
  priceBand: { min: number; max: number } | null;
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** Faixa de ±15% em torno do preço pedido. */
export function priceBand(price: unknown): { min: number; max: number } | null {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { min: Math.round(n * 0.85), max: Math.round(n * 1.15) };
}

export function buildListingQuery(brief: PropertyBrief): QueryPlan {
  const typology = s(brief.typology) || null;
  const zone = s(brief.location) || s(brief.city) || null;
  const band = priceBand(brief.asking_price);
  const missing: string[] = [];
  if (!zone) missing.push("zona");
  if (!typology) missing.push("tipologia");

  if (!zone && !typology) {
    return { canSearch: false, missing, partial: false, query: "", zone, typology, priceBand: band };
  }

  const sites = LISTING_DOMAINS.map((d) => `site:${d}`).join(" OR ");
  const parts = [
    typology,
    s(brief.property_type) && !typology ? s(brief.property_type) : "",
    zone,
    "venda",
  ].filter(Boolean);
  const query = `${parts.join(" ")} (${sites})`;

  return {
    canSearch: true,
    missing,
    partial: missing.length > 0,
    query,
    zone,
    typology,
    priceBand: band,
  };
}

export function similarListingsCacheKey(plan: QueryPlan): string {
  const band = plan.priceBand ? `${plan.priceBand.min}-${plan.priceBand.max}` : "sem-preco";
  return [
    (plan.zone ?? "sem-zona").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    (plan.typology ?? "sem-tipologia").toLowerCase(),
    band,
  ].join("|");
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isWhitelisted(host: string): boolean {
  return LISTING_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Heurística de anúncio individual: páginas de listagem ("/comprar-casas/gaia/")
 * não interessam — o consultor quer anúncios concretos.
 */
export function isIndividualListing(url: string): boolean {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  if (/\/(imovel|imoveis|anuncio|anuncios|listing|property|propriedade)\/[^/]+/.test(path)) {
    // "/imoveis/comprar" sem identificador não é anúncio.
    return /\d{3,}/.test(path);
  }
  return /(^|[/\-_])\d{5,}(\/|\.|$)/.test(path);
}

function listingId(url: string): string {
  const host = hostOf(url) ?? url;
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const ids = path.match(/\d{4,}/g);
  return `${host}#${ids ? ids[ids.length - 1] : path.replace(/\/$/, "")}`;
}

export interface RawResult {
  url?: string | null;
  title?: string | null;
  description?: string | null;
}

export function filterListings(raw: RawResult[], max = 5): SimilarListing[] {
  const seen = new Set<string>();
  const out: SimilarListing[] = [];
  for (const r of raw ?? []) {
    const url = s(r?.url);
    if (!url) continue;
    const host = hostOf(url);
    if (!host || !isWhitelisted(host)) continue;
    if (!isIndividualListing(url)) continue;
    const key = listingId(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, title: s(r.title) || "Anúncio", description: s(r.description) || null, host });
    if (out.length >= max) break;
  }
  return out;
}

export interface SimilarListingsPayload {
  needs_field?: boolean;
  missing?: string[];
  rate_limited?: boolean;
  partial?: boolean;
  results?: SimilarListing[];
  property_label?: string | null;
}

function missingLabel(missing: string[]): string {
  if (missing.length >= 2) return "a zona ou a tipologia";
  return missing[0] === "zona" ? "a zona" : "a tipologia";
}

/** Resposta ao consultor. Os guardrails de linguagem vivem todos aqui. */
export function formatSimilarListings(p: SimilarListingsPayload): string {
  if (p.rate_limited) {
    return `Já fiz ${SIMILAR_MAX_PER_DAY} pesquisas de mercado hoje por ti. Amanhã volto a procurar — ou diz-me qual é o imóvel mais importante e guardo-o para primeiro.`;
  }
  if (p.needs_field) {
    const miss = missingLabel(p.missing ?? ["zona", "tipologia"]);
    return `Para procurar anúncios semelhantes preciso de saber pelo menos ${miss} deste imóvel. Qual é?`;
  }
  const results = p.results ?? [];
  if (!results.length) {
    return "Não encontrei anúncios semelhantes publicados agora nos sites que consulto. Prefiro dizer-te isso do que inventar comparações.";
  }
  const lines = results.map((r) => `- ${r.title} (${r.host})\n  ${r.url}`);
  const warn = p.partial
    ? "\n\nOs dados deste imóvel estão incompletos, por isso a comparação é grosseira."
    : "";
  return `${SIMILAR_FRAMING}\n${lines.join("\n")}${warn}`;
}

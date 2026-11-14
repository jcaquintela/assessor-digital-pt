// Site PÚBLICO da Zome (https://www.zome.pt/pt/) como fonte de anúncios.
//
// - É uma fonte pública, igual a um portal: só se lê o que qualquer visitante
//   vê. NÃO é acesso à carteira interna da Rede — isso continua sem ligação.
// - robots.txt (verificado a 14/11/2026): "User-agent: * / Allow: /"; só
//   bloqueia robôs de SEO específicos. Lê-se a pedido do consultor, nunca em
//   varrimento, com o mesmo limite diário e cache das pesquisas de mercado.
// - Anúncio individual: /pt/{tipo}-{tipologia}-{distrito}-{concelho}-{freguesia}-ZMPT{n}
//   (também /en/, /es/ e o curto /ZMPT{n}; o link mostrado é sempre um /pt/,
//   e https://www.zome.pt/pt/ZMPT{n} abre o anúncio — verificado a 14/11/2026).
//   Páginas EMPT (empreendimentos) não são um imóvel e ficam de fora.
// - Na página, o estado "Vendido"/"Reservado" aparece junto do ID: anúncios
//   vendidos nunca são propostos.
// - Puro (sem rede): a parte com rede está em zome-public.server.ts.

import { foldText } from "@/lib/search/normalize";

export const ZOME_HOST = "zome.pt";
export const ZOME_SOURCE_LABEL = "zome.pt (site público)";

export interface ZomeUrlFacts {
  url: string;
  ref: string;
  kind: string | null;
  typology: string | null;
  municipality: string | null;
  parish: string | null;
  /** "Freguesia, Concelho" — vem do próprio endereço do anúncio. */
  location: string | null;
}

export const zomeCanonicalUrl = (ref: string) => `https://www.zome.pt/pt/${ref}`;

const SMALL = new Set(["de", "do", "da", "dos", "das", "e"]);
function human(slug: string | undefined): string | null {
  if (!slug) return null;
  const words = slug.split("_").filter(Boolean);
  if (!words.length) return null;
  return words.map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

export function normalizeZmpt(ref: string | null | undefined): string | null {
  const m = String(ref ?? "").toUpperCase().match(/ZMPT[-\s]?(\d{3,})/);
  return m ? `ZMPT${m[1]}` : null;
}

/** Factos que o próprio URL de um anúncio zome.pt dá. null se não for anúncio individual. */
export function parseZomeListingUrl(url: string): ZomeUrlFacts | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname.replace(/^www\./, "").toLowerCase() !== ZOME_HOST) return null;
  const path = u.pathname.replace(/\/$/, "");
  const short = path.match(/^(?:\/(?:pt|en|es))?\/(ZMPT\d{5,})$/i);
  if (short) {
    const ref = short[1]!.toUpperCase();
    return { url: zomeCanonicalUrl(ref), ref, kind: null, typology: null, municipality: null, parish: null, location: null };
  }
  const m = path.match(/^\/(pt|en|es)\/([a-z0-9_-]+)-(ZMPT\d{5,})$/i);
  if (!m) return null;
  const lang = m[1]!.toLowerCase();
  const parts = m[2]!.toLowerCase().split("-").filter(Boolean);
  const kind = parts.shift() ?? null;
  const typ = parts[0]?.match(/^t(\d{1,2})(?:_\d)?$/);
  if (typ) parts.shift();
  // distrito, concelho, freguesia (a freguesia pode ter hífenes).
  const [, municipality, ...parish] = parts;
  const mun = human(municipality);
  const par = human(parish.join("_"));
  const ref = m[3]!.toUpperCase();
  return {
    url: lang === "pt" ? `https://www.zome.pt${path}` : zomeCanonicalUrl(ref),
    ref,
    kind: lang === "pt" && kind && /^[a-z_]+$/.test(kind) ? kind : null,
    typology: typ ? `T${typ[1]}` : null,
    municipality: mun,
    parish: par,
    location: [par, mun].filter(Boolean).join(", ") || null,
  };
}

export const isZomeListingUrl = (url: string) => parseZomeListingUrl(url) != null;

/** Pesquisa dirigida ao site público (via motor de pesquisa, não varrimento). */
export function zomeSearchQuery(p: { typology?: string | null; propertyType?: string | null; location?: string | null }): string | null {
  const loc = String(p.location ?? "").trim();
  if (!loc) return null;
  const what = [p.propertyType, p.typology].filter(Boolean).join(" ");
  return `site:zome.pt ${what ? `${what} ` : ""}${loc} venda`.replace(/\s+/g, " ").trim();
}

export function zomeRefQuery(ref: string): string | null {
  const r = normalizeZmpt(ref);
  return r ? `site:zome.pt ${r}` : null;
}

export interface ZomeRawResult { url?: string | null; title?: string | null; description?: string | null }

export interface ZomeListing {
  url: string;
  host: string;
  title: string;
  description: string | null;
  ref: string;
  typology: string | null;
  location: string | null;
  price: number | null;
  areaM2: number | null;
  /** "page" = lido na página do anúncio; "search_result" = só no resultado da pesquisa. */
  verification: "page" | "search_result";
  /** Só com a página lida: "vendido" | "reservado" | "publicado". */
  status?: "vendido" | "reservado" | "publicado" | null;
}

function parsePrice(text: string): number | null {
  const m = text.match(/(\d{2,3}(?:[.\s\u00a0]\d{3})+)\s*€(?!\s*\/\s*m)/);
  return m ? Number(m[1]!.replace(/[.\s\u00a0]/g, "")) : null;
}

/** Resultados de pesquisa → só anúncios individuais zome.pt, sem repetidos. */
export function filterZomeResults(raw: ZomeRawResult[], max = 5): ZomeListing[] {
  const seen = new Set<string>();
  const out: ZomeListing[] = [];
  for (const r of raw ?? []) {
    const facts = parseZomeListingUrl(String(r?.url ?? ""));
    if (!facts || seen.has(facts.ref)) continue;
    seen.add(facts.ref);
    const title = String(r.title ?? "").trim() || `Anúncio ${facts.ref}`;
    const description = String(r.description ?? "").trim() || null;
    out.push({
      url: facts.url, host: ZOME_HOST, title, description, ref: facts.ref,
      typology: facts.typology, location: facts.location,
      price: parsePrice(`${title} ${description ?? ""}`),
      areaM2: null, verification: "search_result",
    });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Página de um anúncio (markdown) → factos lidos na própria página.
 * Só aceita a página se o ID mostrado for a referência do URL.
 */
export function parseZomePage(url: string, markdown: string, title?: string | null): ZomeListing | null {
  const facts = parseZomeListingUrl(url);
  if (!facts) return null;
  const md = String(markdown ?? "");
  const idAt = md.search(new RegExp(`ID\\s*\\**\\s*${facts.ref}\\b`, "i"));
  if (idAt < 0) return null;
  const after = md.slice(idAt, idAt + 400);
  const before = md.slice(Math.max(0, idAt - 300), idAt);
  const area = md.match(/(\d{2,4}(?:[.,]\d+)?)\s*m²\s*área útil/i);
  const status = /\bVendido\b/i.test(after) ? "vendido" : /\bReservado\b/i.test(after) ? "reservado" : "publicado";
  // Breadcrumb antes do ID: "## **Apartamento T1** para venda / Freguesia › Concelho › Distrito".
  const head = before.match(/\*\*\s*[A-Za-zÀ-ÿ ]+?\s+T(\d{1,2})\s*\*\*/);
  const crumbs = before.split("\n").map((x) => x.trim()).filter((x) => x && x !== "›" && !/[#*!\[\]]/.test(x));
  const crumbLoc = crumbs.length >= 3 ? `${crumbs[crumbs.length - 3]}, ${crumbs[crumbs.length - 2]}` : null;
  const cleanTitle = String(title ?? "").replace(/^Zome Portugal\s*-\s*/i, "").replace(new RegExp(`\\s*-\\s*${facts.ref}\\s*$`, "i"), "").trim();
  return {
    url: facts.url, host: ZOME_HOST,
    title: cleanTitle || `Anúncio ${facts.ref}`,
    description: null, ref: facts.ref,
    typology: facts.typology ?? (head ? `T${head[1]}` : null), location: facts.location ?? crumbLoc,
    price: status === "vendido" ? null : parsePrice(after),
    areaM2: area ? Math.round(Number(area[1]!.replace(",", "."))) : null,
    verification: "page",
    status,
  };
}

/** A zona pedida aparece na localização que o URL dá? */
export function zomeInZone(l: Pick<ZomeListing, "location">, zone: string | null | undefined): boolean {
  if (!zone) return true;
  return foldText(l.location).includes(foldText(zone));
}

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
    if (p.price <= brief.budgetMax.value) reasons.push(assumed ? "dentro do teto assumido" : "dentro do orçamento");
    else caveats.push(assumed ? "acima do teto assumido" : "acima do orçamento");
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
  };
}

export interface PortalListing { url: string; title: string; description?: string | null; host: string }

export function fromPortalListing(l: PortalListing, brief: BuyerBrief): ListingProposal {
  const text = `${l.title} ${l.description ?? ""}`;
  const location = brief.zone && foldText(text).includes(foldText(brief.zone.value)) ? brief.zone.value : null;
  const base = { price: parseListingPrice(text), typology: parseListingTypology(text), location };
  const { reasons, caveats } = within(brief, base);
  return {
    url: l.url,
    source: "portal",
    sourceLabel: l.host,
    title: l.title || "Anúncio",
    zmptRef: findZmptRef(l.title, l.description, l.url),
    ...base,
    metroDistance: null,
    // Um resultado de pesquisa não prova que o anúncio ainda está ativo.
    availability: null,
    matchReasons: reasons,
    caveats,
  };
}

function money(n: number | null): string {
  return n == null ? `preço ${UNVERIFIED}` : `${Math.round(n).toLocaleString("pt-PT")} €`;
}

/** Bloco de uma proposta, em sintaxe WhatsApp. Devolve null sem link real. */
export function formatProposal(p: ListingProposal, index: number): string | null {
  if (!/^https?:\/\//.test(p.url)) return null;
  const head = `${index}. *${p.title}* — ${money(p.price)}`;
  const facts = [
    `Tipologia: ${p.typology ?? UNVERIFIED}`,
    `Local: ${p.location ?? UNVERIFIED}`,
  ].join(" · ");
  const origin = [`Origem: ${p.sourceLabel}`, p.zmptRef ? `Ref. ${p.zmptRef}` : null].filter(Boolean).join(" · ");
  const status = [
    `Metro: ${p.metroDistance ?? UNVERIFIED}`,
    `Estado: ${p.availability ? `${p.availability} (verificado na tua carteira)` : UNVERIFIED}`,
  ].join(" · ");
  const why = p.matchReasons.length ? `Porquê: ${p.matchReasons.join(", ")}.` : "Porquê: critérios por confirmar.";
  const warn = p.caveats.length ? `_Atenção: ${p.caveats.join("; ")}._` : null;
  return [head, `   ${facts}`, `   ${origin}`, `   ${status}`, `   ${why}`, warn ? `   ${warn}` : null, `   ${p.url}`]
    .filter(Boolean).join("\n");
}

/** Ordena: primeiro sem avisos, depois mais razões de encaixe. */
export function rankProposals(list: ListingProposal[]): ListingProposal[] {
  return [...list].sort((a, b) => a.caveats.length - b.caveats.length || b.matchReasons.length - a.matchReasons.length);
}

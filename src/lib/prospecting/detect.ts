// Deteção determinística (sem IA) de placas de prospeção a partir de texto PT-PT.
// Usada para extrair pistas antes de pedir confirmação ao consultor.

export type DetectedSourceType = "street_sign" | "referral" | "online_listing" | "direct_observation" | "other";
export type DetectedListingType = "owner_sale" | "other_agency" | "own_agency" | "unknown";

export interface DetectedProspecting {
  matched: boolean;
  phone: string | null;
  location: string | null;
  agency_name: string | null;
  source_type: DetectedSourceType;
  listing_type: DetectedListingType;
  confidence: number;
  reasons: string[];
}

const AGENCY_HINTS = [
  "ERA", "Remax", "RE/MAX", "Century 21", "Century21", "Keller Williams", "KW",
  "Zome", "Predimed", "Coldwell", "Iad", "Engel & Völkers", "Engel", "Habinédita", "Decisões e Soluções",
];

const OWNER_HINTS = [
  /\bvende[- ]?se\b/i,
  /\bparticular\b/i,
  /\bpr[oó]prio\b/i,
  /\bpela?\s+pr[oó]pri[oa]\b/i,
  /\bsem\s+mediador/i,
  /\bdireto\s+do\s+dono\b/i,
];

const SIGN_HINTS = [/\bplaca\b/i, /\bletreiro\b/i, /\bcartaz\b/i, /\bfachada\b/i];

function extractPhone(text: string): string | null {
  // Números portugueses: 9XX XXX XXX ou +351 9XX XXX XXX, ou fixo 2XX...
  const clean = text.replace(/[.\-\u00A0]/g, " ").replace(/\s+/g, " ");
  const re = /(?:\+?351\s*)?([239]\d{2})\s*(\d{3})\s*(\d{3})\b/;
  const m = clean.match(re);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

function extractLocation(text: string): string | null {
  // Padrões: "em <Local>", "na <Rua/Av> ...", "de <Local>"
  const patterns: RegExp[] = [
    /\b(?:em|na|no|de)\s+(?:Rua|Avenida|Av\.?|Travessa|Praça|Largo|Alameda)\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][\p{L}0-9º°\s\-\.']{2,60}/u,
    /\b(?:em|no|na)\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][\p{L}\-']{2,30}(?:\s+de\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][\p{L}\-']{2,30})?)\b/u,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[0] || m[1]).trim().replace(/\s+/g, " ");
  }
  return null;
}

function extractAgency(text: string): string | null {
  const lower = text.toLowerCase();
  for (const a of AGENCY_HINTS) {
    if (lower.includes(a.toLowerCase())) return a;
  }
  return null;
}

export function detectProspecting(input: string): DetectedProspecting {
  const text = (input ?? "").trim();
  const reasons: string[] = [];
  if (!text) {
    return { matched: false, phone: null, location: null, agency_name: null, source_type: "other", listing_type: "unknown", confidence: 0, reasons };
  }

  const phone = extractPhone(text);
  if (phone) reasons.push("número detetado");

  const hasSign = SIGN_HINTS.some((r) => r.test(text));
  if (hasSign) reasons.push("menção a placa");

  const hasOwner = OWNER_HINTS.some((r) => r.test(text));
  const agency = extractAgency(text);
  const location = extractLocation(text);
  if (location) reasons.push("localização mencionada");

  let listing_type: DetectedListingType = "unknown";
  if (hasOwner) { listing_type = "owner_sale"; reasons.push("indícios de venda pelo próprio"); }
  else if (agency) { listing_type = "other_agency"; reasons.push(`agência mencionada: ${agency}`); }

  const source_type: DetectedSourceType = hasSign ? "street_sign" : phone ? "other" : "other";

  // Confiança: 0.4 base por telefone, +0.2 placa, +0.15 owner/agency, +0.1 localização
  let confidence = 0;
  if (phone) confidence += 0.4;
  if (hasSign) confidence += 0.2;
  if (hasOwner || agency) confidence += 0.15;
  if (location) confidence += 0.1;
  const matched = confidence >= 0.4;

  return {
    matched,
    phone,
    location,
    agency_name: agency,
    source_type,
    listing_type,
    confidence: Math.min(1, confidence),
    reasons,
  };
}
// Normalização de dados de contactos (PT-first).
// Não depende de libs externas para manter o bundle leve.

export type PhoneKind = "mobile" | "landline" | "whatsapp" | "unknown";

export interface NormalizedPhone {
  raw: string;
  e164: string | null;
  countryCode: string | null; // "351", "34", ...
  kind: PhoneKind;
}

/**
 * Normaliza um número em E.164. País por defeito: PT (+351).
 * Não rejeita o contacto se não conseguir normalizar: devolve e164=null e mantém raw.
 */
export function normalizePhoneE164(input: string | null | undefined, defaultCountry: string = "PT"): NormalizedPhone {
  const raw = (input ?? "").toString();
  const cleaned = raw.replace(/[\s\-().]/g, "").trim();
  if (!cleaned) return { raw, e164: null, countryCode: null, kind: "unknown" };

  // já em E.164
  if (/^\+\d{6,15}$/.test(cleaned)) {
    const cc = extractCountryCode(cleaned);
    return { raw, e164: cleaned, countryCode: cc, kind: guessKind(cleaned, cc) };
  }

  // "00351..." → "+351..."
  if (/^00\d{6,}$/.test(cleaned)) {
    const e164 = "+" + cleaned.slice(2);
    const cc = extractCountryCode(e164);
    return { raw, e164, countryCode: cc, kind: guessKind(e164, cc) };
  }

  // dígitos puros: assume país por defeito
  if (/^\d{6,15}$/.test(cleaned)) {
    if (defaultCountry === "PT" && /^[29]\d{8}$/.test(cleaned)) {
      const e164 = "+351" + cleaned;
      return { raw, e164, countryCode: "351", kind: guessKind(e164, "351") };
    }
    // Sem heurística fiável: mantém raw mas sem e164 confirmado.
    return { raw, e164: null, countryCode: null, kind: "unknown" };
  }

  return { raw, e164: null, countryCode: null, kind: "unknown" };
}

function extractCountryCode(e164: string): string | null {
  // Tabela mínima; para o âmbito de PT/EU basta.
  const m = e164.match(/^\+(\d{1,3})/);
  if (!m) return null;
  return m[1];
}

function guessKind(e164: string, cc: string | null): PhoneKind {
  if (cc === "351") {
    const local = e164.slice(4);
    if (/^9/.test(local)) return "mobile";
    if (/^2/.test(local)) return "landline";
  }
  return "unknown";
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.toString().trim().toLowerCase();
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeName(input: string): string {
  return stripAccents(input.trim().toLowerCase()).replace(/\s+/g, " ");
}

/** Similaridade [0,1] entre dois nomes (Jaccard sobre tokens normalizados). */
export function similarName(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}
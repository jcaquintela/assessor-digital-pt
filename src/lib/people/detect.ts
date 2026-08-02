// Deteção determinística de campos de contacto em texto livre PT-PT.
// Não substitui IA: cobre casos rápidos ("Regista a Ana, 912...") sem chamar modelo.

import { normalizeEmail, normalizePhoneE164, type NormalizedPhone } from "./normalize";

export type DetectedRole =
  | "owner" | "potential_owner" | "buyer" | "potential_buyer"
  | "client" | "reference" | "partner" | "supplier" | "colleague" | "other";

export interface DetectedPerson {
  name: string | null;
  phones: NormalizedPhone[];
  emails: string[];
  roles: DetectedRole[];
  company: string | null;
  location: string | null;
  propertyType: string | null;
  budgetMax: number | null;
  referredByName: string | null;
  notes: string | null;
}

const ROLE_KEYWORDS: Array<[RegExp, DetectedRole]> = [
  [/\bpotencial(?:\s+propriet[áa]rio)\b/i, "potential_owner"],
  [/\bpropriet[áa]ri[oa]\b/i, "owner"],
  [/\bpotencial(?:\s+comprador)\b/i, "potential_buyer"],
  [/\bcomprador[a]?\b/i, "buyer"],
  [/\bcliente\b/i, "client"],
  [/\brefer[eê]ncia\b|\brecomend[aou]/i, "reference"],
  [/\bparceir[oa]\b/i, "partner"],
  [/\bfornecedor(?:a)?\b/i, "supplier"],
  [/\bcolega\b/i, "colleague"],
];

const PROPERTY_TYPE_RE = /\bT\d\b|\bstudio\b|\bmoradia\b|\bapartamento\b|\bloja\b|\bterreno\b/i;

const NAME_INTRO_RE =
  /\b(?:regista|guarda|adiciona|cria|conheci|contacto|contacta|liga\s+ao|liga\s+à)\s+(?:(?:o|a|este\s+contacto:?)\s+)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+){0,3})/;

// "Ana Silva, 912 333 444, proprietária de..." — o nome vem primeiro, sem
// verbo antes. Sem isto o contacto ficava gravado como "Sem nome".
const NAME_LEADING_RE =
  /^\s*(?:o|a|os|as)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+){0,3})\s*(?=,|:|\s+\+?\d|\s*[-–—]|$)/;

// Palavras que parecem nome mas não são (papéis, saudações, comandos).
const NAME_STOPWORDS = new Set([
  "propietario","proprietario","proprietaria","comprador","compradora","cliente",
  "referencia","parceiro","parceira","colega","fornecedor","fornecedora",
  "ola","olá","bom","boa","hoje","amanha","amanhã","novo","nova","contacto",
  "telefone","telemovel","telemóvel","nota","lembrete","visita","imovel","imóvel",
]);

function isPlausibleName(candidate: string): boolean {
  const first = candidate.split(/\s+/)[0] ?? "";
  const norm = first.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (NAME_STOPWORDS.has(norm) || NAME_STOPWORDS.has(first.toLowerCase())) return false;
  if (/\d/.test(candidate)) return false;
  return candidate.trim().length >= 2;
}

const REFERRED_RE =
  /\brecomend(?:ad[oa]?|a[cç][ãa]o)\s+d[oa]?\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+)?)/;

const BUDGET_RE =
  /\b(?:at[eé]|m[áa]x(?:imo)?|no\s+m[áa]ximo)\s+(\d{2,4})\s*(?:mil|k)\s*(?:€|eur|euros)?/i;

const LOCATION_HINTS = [
  "gaia","porto","lisboa","matosinhos","canelas","boavista","cascais","oeiras",
  "sintra","braga","aveiro","coimbra","faro","almada","setúbal","setubal",
  "vila nova de gaia","paranhos","campanhã","campanha","paranhos","maia",
];

function detectLocation(text: string): string | null {
  const lower = text.toLowerCase();
  for (const loc of LOCATION_HINTS) {
    const idx = lower.indexOf(loc);
    if (idx >= 0) {
      const original = text.slice(idx, idx + loc.length);
      return original.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  const m = text.match(/\bem\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+){0,2})/);
  return m?.[1] ?? null;
}

export function detectPerson(text: string): DetectedPerson {
  const out: DetectedPerson = {
    name: null, phones: [], emails: [], roles: [],
    company: null, location: null, propertyType: null,
    budgetMax: null, referredByName: null, notes: null,
  };

  if (!text?.trim()) return out;

  // Emails
  const emailMatches = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
  for (const e of emailMatches) {
    const n = normalizeEmail(e);
    if (n && !out.emails.includes(n)) out.emails.push(n);
  }

  // Telefones (formatos PT: 9XXXXXXXX, 2XXXXXXXX, +351..., 00351...)
  const phoneMatches = text.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,14}\d/g) ?? [];
  const seen = new Set<string>();
  for (const p of phoneMatches) {
    const cleaned = p.replace(/[\s\-.]/g, "");
    if (cleaned.length < 9) continue;
    // Ignora sequências que são claramente valores (ex: 350000 tem 6 dígitos)
    const n = normalizePhoneE164(p);
    const key = n.e164 ?? cleaned;
    if (seen.has(key)) continue;
    seen.add(key);
    out.phones.push(n);
  }

  // Papéis
  for (const [re, role] of ROLE_KEYWORDS) {
    if (re.test(text) && !out.roles.includes(role)) out.roles.push(role);
  }

  // Nome (heurística simples)
  const introMatch = text.match(NAME_INTRO_RE);
  if (introMatch) out.name = introMatch[1];
  if (!out.name) {
    const leading = text.match(NAME_LEADING_RE);
    const candidate = leading?.[1]?.trim();
    if (candidate && isPlausibleName(candidate)) out.name = candidate;
  }

  // Empresa (após "da/do" antes de vírgula ou fim)
  const orgMatch = text.match(/\bd[ao]\s+((?:Empresa|Agência|Ag[eê]ncia|Grupo|Sociedade)\s+[A-ZÁÉÍÓÚ][\wÀ-ÿ'-]+(?:\s+[A-ZÁÉÍÓÚ][\wÀ-ÿ'-]+){0,3})/);
  if (orgMatch) out.company = orgMatch[1];

  // Localização
  out.location = detectLocation(text);

  // Tipologia
  const ptMatch = text.match(PROPERTY_TYPE_RE);
  if (ptMatch) out.propertyType = ptMatch[0].toUpperCase();

  // Orçamento
  const budMatch = text.match(BUDGET_RE);
  if (budMatch) out.budgetMax = Number(budMatch[1]) * 1000;

  // Referenciador
  const refMatch = text.match(REFERRED_RE);
  if (refMatch) out.referredByName = refMatch[1];

  return out;
}

export const ROLE_LABELS_PT: Record<DetectedRole, string> = {
  owner: "proprietário",
  potential_owner: "potencial proprietário",
  buyer: "comprador",
  potential_buyer: "potencial comprador",
  client: "cliente",
  reference: "referência",
  partner: "parceiro",
  supplier: "fornecedor",
  colleague: "colega",
  other: "outro",
};
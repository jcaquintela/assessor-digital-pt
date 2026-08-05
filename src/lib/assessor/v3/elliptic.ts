// Frases elípticas — "[intenção] à [entidade] [nome] [contacto]" sem verbo.
//
// Bug real: "Seguimento à lead Maria Manuela 912 333 411" falhava quando a
// pessoa ainda não existia (sem match por telefone) e caía em Diversos com
// "não percebi". Nome + telefone + palavra de intenção chegam para PROPOR a
// criação — nunca para criar sem confirmação.
//
// Módulo puro: sem I/O. O caller decide se a pessoa já existe.

export type EllipticIntent = "seguimento" | "lead" | "contacto" | "visita" | "proposta";

export interface EllipticEntity {
  intent: EllipticIntent;
  entityWord: string | null; // "lead", "cliente", "proprietário"...
  name: string;
  phone: string | null;
  withFollowUp: boolean;
}

const INTENT_WORDS: Array<[RegExp, EllipticIntent]> = [
  [/^seguimento\b/i, "seguimento"],
  [/^follow[-\s]?up\b/i, "seguimento"],
  [/^lead\b/i, "lead"],
  [/^nova\s+lead\b/i, "lead"],
  [/^contacto\b/i, "contacto"],
  [/^visita\b/i, "visita"],
  [/^proposta\b/i, "proposta"],
];

// "à lead", "ao cliente", "para a proprietária", "da lead"
const CONNECTOR_RE =
  /^\s*(?:[àa]o?s?|para\s+(?:o|a)?|d[oa]s?|com\s+(?:o|a)?|:|-|–)?\s*/i;

const ENTITY_WORDS =
  /^(lead|leads|cliente|contacto|pessoa|propriet[áa]ri[oa]|comprador[a]?|vendedor[a]?|senhor[a]?|sr\.?|sra\.?|dona?)\b\s*/i;

const NAME_RE =
  /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'-]+){0,3})/;

const PHONE_RE = /(?:\+?351)?\s*([239]\d{2})[\s.-]?(\d{3})[\s.-]?(\d{3})/;

function pickPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

/**
 * Deteta o padrão elíptico. Devolve null quando a frase tem verbo de acção
 * (aí o caminho normal do motor trata) ou quando falta nome.
 */
export function detectEllipticEntity(text: string): EllipticEntity | null {
  const raw = (text ?? "").trim();
  if (!raw || raw.length > 240) return null;
  if (/\?\s*$/.test(raw)) return null; // pergunta, não registo

  let intent: EllipticIntent | null = null;
  let rest = raw;
  for (const [re, value] of INTENT_WORDS) {
    const m = raw.match(re);
    if (m) {
      intent = value;
      rest = raw.slice(m[0].length);
      break;
    }
  }
  if (!intent) return null;

  rest = rest.replace(CONNECTOR_RE, "");
  const entityMatch = rest.match(ENTITY_WORDS);
  const entityWord = entityMatch ? entityMatch[1].toLowerCase() : null;
  if (entityMatch) rest = rest.slice(entityMatch[0].length);

  const nameMatch = rest.match(NAME_RE);
  const name = nameMatch?.[1]?.trim() ?? null;
  if (!name || name.length < 3) return null;

  const phone = pickPhone(raw);
  // Sem contacto e sem palavra de entidade não há sinal suficiente.
  if (!phone && !entityWord) return null;

  return {
    intent,
    entityWord,
    name,
    phone,
    withFollowUp: intent === "seguimento" || intent === "visita",
  };
}

export function ellipticConfirmQuestion(d: EllipticEntity): string {
  const label = d.entityWord === "lead" || d.intent === "lead" ? "lead nova" : "contacto novo";
  const tail = d.withFollowUp ? " com seguimento" : "";
  return `Queres que registe a ${d.name} como ${label}${tail}?`;
}

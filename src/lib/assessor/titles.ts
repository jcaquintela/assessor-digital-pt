// Higiene de títulos.
//
// Bug real: quando o consultor pedia um lembrete sem dizer o quê ("é apenas
// para registar"), o modelo devolvia a STRING "null" como título. Como
// `z.string().min(1)` aceita "null", o valor era gravado e o consultor via
// "tens um null". Regra: a string "null" (e afins) nunca é um título.

const PLACEHOLDER_RE =
  /^(null|nulo|undefined|undef|none|nan|n\/?a|sem\s+t[ií]tulo|sem\s+assunto|sem\s+nome|[-–—.]{1,3})$/i;

export function isPlaceholderTitle(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const raw = String(value).trim();
  if (!raw) return true;
  return PLACEHOLDER_RE.test(raw);
}

// Bug real: títulos criados a partir de blocos de contexto herdavam a linha de
// confirmação do próprio assessor ("Assessor: Feito. Registei..."), o que dava
// títulos poluídos na ficha do seguimento.
const SPEAKER_RE = /^\s*(assessor|afonso|assistente|bot)\s*[:\-–—]\s*/i;
const CONFIRMATION_RE =
  /^\s*(feito|combinado|perfeito|certo|ok|prontos?)\b[.,!]?\s*(j[aá]\s+)?(registei|guardei|criei|anotei|marquei|apontei)?\b[:.,]?\s*/i;

function stripAssistantVoice(raw: string): string {
  let out = raw;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(SPEAKER_RE, "").replace(CONFIRMATION_RE, "");
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

// Devolve um título limpo ou `null` se não houver nada aproveitável.
// Também remove tokens "null"/"undefined" colados a um título real
// (ex.: "null - ligar ao Paulo" → "ligar ao Paulo").
export function cleanTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  raw = stripAssistantVoice(raw.split("\n")[0]?.trim() || raw);
  if (!raw) return null;
  raw = raw
    .replace(/\b(null|undefined)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—:.,]+|[\s\-–—:,]+$/g, "")
    .trim();
  if (!raw || isPlaceholderTitle(raw)) return null;
  // Bug real: o modelo devolveu "?" como tipo de evento e o seguimento ficou
  // "? ao T2 em Oliveira do Douro". Só pontuação nunca é título.
  if (!/[\p{L}\p{N}]/u.test(raw)) return null;
  return raw.slice(0, 200);
}

// Título garantido para escrita na BD. Nunca devolve vazio nem "null".
export function ensureTitle(value: unknown, fallback = "Lembrete"): string {
  return cleanTitle(value) ?? fallback;
}

// Título garantido para leitura/apresentação.
export function displayTitle(value: unknown, fallback = "compromisso"): string {
  return cleanTitle(value) ?? fallback;
}

// O imóvel descrito por palavras. Um consultor fala do "terreno de Canelas"
// muito antes de esse terreno existir como registo. Este módulo transforma
// essa descrição num rasto comparável, para que visitas e comissões que
// falam do mesmo imóvel possam ser reconhecidas como o mesmo processo.
// Puro: importável no cliente, no servidor e nos testes.

export interface PropertyHint {
  /** Tipo dito pelo consultor, normalizado ("terreno", "moradia", "t3"...). */
  type: string;
  /** Localidade dita a seguir ao tipo, quando existe. */
  location: string | null;
  /** Como o assessor deve chamar-lhe em PT-PT ("terreno em Canelas"). */
  label: string;
}

const TYPES = [
  "terreno", "lote", "moradia", "vivenda", "apartamento", "casa", "quinta",
  "herdade", "loja", "armazem", "predio", "escritorio", "garagem", "estudio",
];

const TYPE_RE = new RegExp(
  `\\b(${TYPES.join("|")}|t[0-6])\\b`,
  "i",
);

const STOP_LOCATION = new Set([
  "que", "de", "da", "do", "dos", "das", "por", "com", "para", "e", "a", "o",
  "no", "na", "nos", "nas", "em", "ao", "à", "as", "os", "um", "uma", "foi",
  "esta", "está", "ficou", "hoje", "amanha", "amanhã", "ontem", "visita",
  "comissao", "comissão", "cliente", "senhor", "senhora", "dona",
]);

export function normalizeHintText(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai o imóvel descrito no texto, mesmo que ainda não exista registo. */
export function extractPropertyHint(raw: string): PropertyHint | null {
  const norm = normalizeHintText(raw);
  const m = norm.match(TYPE_RE);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const after = norm.slice((m.index ?? 0) + m[0].length);
  // "terreno de Canelas", "terreno em Vila Nova", "moradia na Rua do Sol"
  const locMatch = after.match(/^\s*(?:de|da|do|dos|das|em|na|no|nas|nos)\s+([a-z0-9º'\-\s]{2,40})/);
  let location: string | null = null;
  if (locMatch) {
    const words: string[] = [];
    for (const w of locMatch[1].split(" ")) {
      const word = w.trim();
      if (!word) continue;
      if (STOP_LOCATION.has(word)) break;
      words.push(word);
      if (words.length >= 4) break;
    }
    const joined = words.join(" ").trim();
    location = joined.length >= 2 ? joined : null;
  }
  const label = location ? `${type} em ${location}` : type;
  return { type, location, label };
}

/** O texto fala do mesmo imóvel descrito? Tipo igual e, se houver, localidade. */
export function textMatchesHint(text: string, hint: PropertyHint): boolean {
  const norm = normalizeHintText(text);
  if (!norm.includes(hint.type)) return false;
  if (hint.location && !norm.includes(hint.location)) return false;
  return true;
}

/** Título humano para o negócio proposto a partir da descrição. */
export function dealTitleFromHint(hint: PropertyHint, kind = "Venda"): string {
  const nice = hint.label.charAt(0).toUpperCase() + hint.label.slice(1);
  return `${kind} · ${nice}`;
}

/** Título humano para o imóvel a criar a partir da descrição. */
export function propertyTitleFromHint(hint: PropertyHint): string {
  const nice = hint.label.charAt(0).toUpperCase() + hint.label.slice(1);
  return nice.slice(0, 120);
}
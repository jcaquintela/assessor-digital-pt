// Formatter central de texto para Diversos.
//
// REGRA DURA: nada que o consultor leia em Diversos pode ser JSON em bruto.
// Todas as escritas em miscellaneous_items passam por sanitizeMiscFields(),
// e a UI passa tudo por humanizeMiscText() como segunda rede (protege dados
// antigos e qualquer regressão futura num caminho novo de escrita).

export const FIELD_LABELS_PT: Record<string, string> = {
  title: "Assunto",
  name: "Nome",
  full_name: "Nome",
  person_name: "Pessoa",
  phone: "Telefone",
  phone_number: "Telefone",
  email: "Email",
  company: "Empresa",
  role: "Cargo",
  location: "Localização",
  address: "Morada",
  city: "Cidade",
  price: "Preço",
  amount: "Valor",
  currency: "Moeda",
  description: "Descrição",
  notes: "Notas",
  summary: "Resumo",
  date: "Data",
  due_date: "Data",
  due_time: "Hora",
  start_time: "Hora",
  time: "Hora",
  typology: "Tipologia",
  relationship_type: "Relação",
  event_type: "Tipo",
  category: "Categoria",
  status: "Estado",
  source: "Origem",
  reason: "Motivo",
};

export const INTENT_LABELS_PT: Record<string, string> = {
  create_person: "Registar pessoa",
  create_property: "Registar imóvel",
  create_event: "Marcar compromisso",
  create_follow_up: "Criar seguimento",
  create_reminder: "Criar lembrete",
  create_financial_movement: "Registar movimento",
  create_prospecting_lead: "Registar prospeção",
  create_miscellaneous: "Guardar nota",
};

function labelFor(key: string): string {
  const known = FIELD_LABELS_PT[key];
  if (known) return known;
  const pretty = key.replace(/[_-]+/g, " ").trim();
  return pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : key;
}

function isNoise(key: string): boolean {
  return /(^|_)(id|ids|uuid|user_id|confidence|score|raw|payload|embedding|tokens?)$/i.test(key);
}

function renderValue(value: unknown, depth: number): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    const parts = value
      .flatMap((v) => (typeof v === "object" && v !== null ? renderValue(v, depth + 1) : [String(v)]))
      .filter(Boolean);
    return parts.length ? [parts.join(", ")] : [];
  }
  if (typeof value === "object") {
    if (depth >= 2) return [];
    return renderObject(value as Record<string, unknown>, depth + 1);
  }
  return [String(value).slice(0, 300)];
}

function renderObject(obj: Record<string, unknown>, depth = 0): string[] {
  const lines: string[] = [];
  for (const [key, raw] of Object.entries(obj)) {
    if (isNoise(key)) continue;
    const rendered = renderValue(raw, depth);
    if (!rendered.length) continue;
    if (rendered.length === 1 && !rendered[0]!.includes("\n")) {
      lines.push(`${labelFor(key)}: ${rendered[0]}`);
    } else {
      lines.push(`${labelFor(key)}:`);
      for (const line of rendered) lines.push(`  ${line}`);
    }
  }
  return lines;
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) return true;
  // JSON truncado/partido também nunca pode chegar ao consultor.
  return /^[{[]/.test(t) && /"\s*:/.test(t);
}

// Converte QUALQUER valor (objeto, array, string com JSON embutido) em
// português legível. Se já for texto normal, devolve-o intacto.
export function humanizeMiscText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const lines = Array.isArray(value)
      ? renderValue(value, 0)
      : renderObject(value as Record<string, unknown>);
    return lines.join("\n");
  }
  const text = String(value);
  if (!looksLikeJson(text)) return text;
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object") return text;
    const lines = Array.isArray(parsed)
      ? renderValue(parsed, 0)
      : renderObject(parsed as Record<string, unknown>);
    return lines.length ? lines.join("\n") : text;
  } catch {
    // JSON partido: nunca mostrar chavetas ao consultor.
    const stripped = text
      .replace(/[{}\[\]"]/g, " ")
      .replace(/\s*:\s*/g, ": ")
      .replace(/\s*,\s*/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    return stripped || text;
  }
}

function firstLine(text: string): string {
  const line = text.split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  return line;
}

// Padrões técnicos que nunca podem ser lidos pelo consultor:
// "search_people:invalid_args", "reminder_not_found", "act sem ferramenta",
// "create_event: Error xyz".
const TECH_PAIR_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s*:\s*[^\n;]+/gi;
const TECH_CODE_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/gi;

export function stripTechnicalCodes(value: string): string {
  let out = String(value ?? "")
    .replace(TECH_PAIR_RE, " ")
    .replace(TECH_CODE_RE, " ")
    .replace(/\bact sem ferramenta\b/gi, " ");
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/(^|\n)\s*[:;-]\s*/g, "$1")
    .trim();
  return out;
}

export function humanizeMiscTitle(value: unknown, fallback = "Nota sem título"): string {
  const humanized = humanizeMiscText(value).trim();
  const line = firstLine(humanized) || fallback;
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

// Único ponto de verdade para escrever em miscellaneous_items.
export function sanitizeMiscFields<T extends {
  title?: unknown;
  original_content?: unknown;
  summary?: unknown;
}>(fields: T): T & { title: string; original_content: string | null; summary: string | null } {
  const original = humanizeMiscText(fields.original_content).trim();
  const summary = stripTechnicalCodes(humanizeMiscText(fields.summary)).trim();
  const title = humanizeMiscTitle(
    fields.title ?? (original || summary),
    "Nota sem título",
  );
  return {
    ...fields,
    title: stripTechnicalCodes(title) || title,
    original_content: original || null,
    summary: summary || null,
  };
}

// Descrição em português normal de uma proposta por confirmar.
export function describePendingPt(
  intent: string | null | undefined,
  payload: Record<string, any> | null | undefined,
  originalContent?: string | null,
): string {
  const lines: string[] = [];
  lines.push(INTENT_LABELS_PT[String(intent ?? "")] ?? "Proposta por confirmar");
  const p = payload && typeof payload === "object" ? payload : {};
  lines.push(...renderObject(p));
  const original = humanizeMiscText(originalContent).trim();
  if (original) lines.push(`Mensagem original: ${original.slice(0, 400)}`);
  return lines.join("\n");
}

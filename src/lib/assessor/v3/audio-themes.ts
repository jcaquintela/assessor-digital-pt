// Segmentação de um áudio em TEMAS — módulo puro (sem BD, sem rede).
//
// Um áudio informal raramente é um assunto só. "Falei com o Carlos da placa
// de Canidelo, quer vender o T3 dele, vai emigrar. Ah, e marca lembrete para
// ligar à Dra. Maria na quarta" são dois temas: uma lead (pessoa + imóvel +
// oportunidade LIGADOS entre si) e uma tarefa isolada.
//
// Aqui só vivem os tipos, a coerção do JSON do modelo, o texto da proposta e
// as correcções tema-a-tema. Quem escreve na base de dados é o
// audio-themes.server.ts, e só depois do consultor confirmar.

export type ThemeKind = "lead" | "deal_update" | "task" | "note" | "visit" | "follow_up";
export type ThemeIntent = "vender" | "comprar" | "arrendar" | "avaliar";
export type ThemeRole = "proprietario" | "comprador" | "referencia" | "outro";
export type ThemeUrgency = "alta" | "media" | "baixa";

export interface ThemePerson {
  name: string | null;
  phone: string | null;
  role: ThemeRole | null;
}

export interface ThemeProperty {
  typology: string | null;
  location: string | null;
  address: string | null;
  features: string | null;
  price: number | null;
}

export interface ThemeOpportunity {
  intent: ThemeIntent | null;
  motivation: string | null;
  urgency: ThemeUrgency | null;
  deadline: string | null;
}

export interface ThemeNextAction {
  type: "ligar" | "visitar" | "enviar" | "outro";
  text: string;
  date: string | null;
  time: string | null;
}

export interface AudioTheme {
  kind: ThemeKind;
  /** Frase curta que descreve o tema, em PT-PT. */
  title: string;
  person: ThemePerson | null;
  property: ThemeProperty | null;
  opportunity: ThemeOpportunity | null;
  next_action: ThemeNextAction | null;
  note: string | null;
  confidential: boolean;
  /** Confiança da extração (0-1). */
  confidence: number;
}

/** Candidato de deduplicação encontrado na base de dados. */
export interface ThemeCandidate {
  id: string;
  label: string;
  score: number;
}

/** Resultado da deduplicação de um tema (calculado no servidor). */
export interface ThemeLinks {
  person_id: string | null;
  person_label: string | null;
  property_id: string | null;
  property_label: string | null;
  opportunity_id: string | null;
  opportunity_label: string | null;
  lead_id: string | null;
  lead_label: string | null;
  /** >1 candidato com confiança insuficiente: perguntar, nunca decidir. */
  ambiguous_people: ThemeCandidate[];
  ambiguous_properties: ThemeCandidate[];
}

export interface AudioThemesPayload {
  themes: AudioTheme[];
  links: ThemeLinks[];
  audio_file_id?: string | null;
  source_message_id?: string | null;
  extracted_at?: string | null;
}

export const AMBIGUITY_THRESHOLD = 0.8;
const MAX_THEMES = 6;

export function emptyLinks(): ThemeLinks {
  return {
    person_id: null, person_label: null,
    property_id: null, property_label: null,
    opportunity_id: null, opportunity_label: null,
    lead_id: null, lead_label: null,
    ambiguous_people: [], ambiguous_properties: [],
  };
}

function str(v: unknown, max = 200): string | null {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.toLowerCase() === "null") return null;
  return t.slice(0, max);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const KINDS = new Set<ThemeKind>(["lead", "deal_update", "task", "note", "visit", "follow_up"]);
const INTENTS = new Set(["vender", "comprar", "arrendar", "avaliar"]);
const ROLES = new Set(["proprietario", "comprador", "referencia", "outro"]);
const URGENCIES = new Set(["alta", "media", "baixa"]);

function coercePerson(raw: any): ThemePerson | null {
  const name = str(raw?.name, 120);
  const phone = str(raw?.phone, 32);
  if (!name && !phone) return null;
  const role = String(raw?.role ?? "").toLowerCase();
  return { name, phone, role: ROLES.has(role) ? (role as ThemeRole) : null };
}

function coerceProperty(raw: any): ThemeProperty | null {
  const p: ThemeProperty = {
    typology: str(raw?.typology, 32),
    location: str(raw?.location, 120),
    address: str(raw?.address, 200),
    features: str(raw?.features, 200),
    price: num(raw?.price),
  };
  return p.typology || p.location || p.address || p.features || p.price ? p : null;
}

function coerceOpportunity(raw: any): ThemeOpportunity | null {
  const intent = String(raw?.intent ?? "").toLowerCase();
  const urgency = String(raw?.urgency ?? "").toLowerCase();
  const o: ThemeOpportunity = {
    intent: INTENTS.has(intent) ? (intent as ThemeIntent) : null,
    motivation: str(raw?.motivation, 200),
    urgency: URGENCIES.has(urgency) ? (urgency as ThemeUrgency) : null,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.deadline ?? "")) ? String(raw.deadline) : null,
  };
  return o.intent || o.motivation || o.urgency || o.deadline ? o : null;
}

function coerceNextAction(raw: any): ThemeNextAction | null {
  const text = str(raw?.text, 200);
  if (!text) return null;
  const type = String(raw?.type ?? "").toLowerCase();
  return {
    type: type === "ligar" || type === "visitar" || type === "enviar" ? type : "outro",
    text,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.date ?? "")) ? String(raw.date) : null,
    time: /^\d{2}:\d{2}$/.test(String(raw?.time ?? "")) ? String(raw.time) : null,
  };
}

export function coerceThemes(raw: any): AudioTheme[] {
  const list = Array.isArray(raw?.themes) ? raw.themes : Array.isArray(raw) ? raw : [];
  const out: AudioTheme[] = [];
  for (const t of list.slice(0, MAX_THEMES)) {
    const kind = String(t?.kind ?? "").toLowerCase() as ThemeKind;
    const title = str(t?.title, 200);
    if (!title) continue;
    const conf = Number(t?.confidence);
    out.push({
      kind: KINDS.has(kind) ? kind : "note",
      title,
      person: coercePerson(t?.person),
      property: coerceProperty(t?.property),
      opportunity: coerceOpportunity(t?.opportunity),
      next_action: coerceNextAction(t?.next_action),
      note: str(t?.note, 400),
      confidential: t?.confidential === true,
      confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.7,
    });
  }
  return out;
}

/** Um tema com pessoa + imóvel + intenção é uma lead, mesmo que o modelo lhe chame outra coisa. */
export function isLeadTheme(theme: AudioTheme): boolean {
  return Boolean(theme.person?.name && (theme.property || theme.opportunity?.intent));
}

// ---- Texto da proposta -----------------------------------------------------

const DIGITS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

export function themeNumber(i: number): string {
  return DIGITS[i] ?? `${i + 1}.`;
}

function ptDate(ymd: string | null, time?: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return time ? `${d}/${m}/${y} às ${time}` : `${d}/${m}/${y}`;
}

function propertyLabel(p: ThemeProperty | null): string {
  if (!p) return "";
  const bits = [p.typology, p.location ? `em ${p.location}` : p.address].filter(Boolean);
  return bits.join(" ");
}

/** Linha de um tema, já com o que foi reconhecido como existente. */
export function formatThemeLine(theme: AudioTheme, links: ThemeLinks): string {
  const parts: string[] = [];
  if (theme.person?.name) {
    const tag = links.person_id ? "contacto que já tinhas" : "novo contacto";
    const tel = theme.person.phone ? `, ${theme.person.phone}` : "";
    parts.push(`${theme.person.name} (${tag}${tel})`);
  }
  const intent = theme.opportunity?.intent;
  const prop = propertyLabel(theme.property);
  const price = theme.property?.price
    ? ` por ${new Intl.NumberFormat("pt-PT").format(theme.property.price)} €`
    : "";
  if (intent && prop) parts.push(`quer ${intent} ${prop}${price}`);
  else if (intent) parts.push(`quer ${intent}`);
  else if (prop) parts.push(`${prop}${price}`);

  let line = parts.length ? parts.join(" ") : theme.title;
  if (links.lead_id) line += ` — ligado à placa "${links.lead_label}" que já tinhas registada`;
  else if (links.opportunity_id) line += ` — ligado ao negócio "${links.opportunity_label}" que já tinhas`;
  else if (links.property_id) line += ` — ligado ao imóvel "${links.property_label}" que já tinhas`;

  const urg = theme.opportunity?.urgency;
  if (urg === "alta") {
    line += theme.opportunity?.motivation ? ` Urgente (${theme.opportunity.motivation}).` : " Urgente.";
  } else if (theme.opportunity?.motivation) {
    line += ` Motivo: ${theme.opportunity.motivation}.`;
  }

  if (theme.next_action) {
    const when = theme.next_action.date ? `, ${ptDate(theme.next_action.date, theme.next_action.time)}` : "";
    line += `${line.endsWith(".") ? "" : "."} Seguimento: ${theme.next_action.text}${when}.`;
  }
  if (theme.note) line += ` ${theme.confidential ? "Nota confidencial" : "Nota"}: ${theme.note}`;
  return line.replace(/\s+/g, " ").trim();
}

/** Perguntas de desambiguação por resolver, na ordem dos temas. */
export function pendingAmbiguities(
  themes: AudioTheme[],
  links: ThemeLinks[],
): { index: number; candidates: ThemeCandidate[]; name: string }[] {
  const out: { index: number; candidates: ThemeCandidate[]; name: string }[] = [];
  themes.forEach((t, i) => {
    const l = links[i] ?? emptyLinks();
    if (!l.person_id && l.ambiguous_people.length > 1) {
      out.push({ index: i, candidates: l.ambiguous_people, name: t.person?.name ?? "" });
    }
  });
  return out;
}

export function formatAmbiguityQuestion(a: { index: number; candidates: ThemeCandidate[]; name: string }): string {
  const names = a.candidates.slice(0, 3).map((c) => c.label);
  const list = names.length === 2 ? `${names[0]} ou ${names[1]}` : names.join(", ");
  return `No ponto ${a.index + 1}, tenho mais do que um contacto parecido com "${a.name}": ${list}. Qual deles é?`;
}

export function formatThemesProposal(themes: AudioTheme[], links: ThemeLinks[]): string {
  const lines = themes.map((t, i) => `${themeNumber(i)} ${formatThemeLine(t, links[i] ?? emptyLinks())}`);
  const head = themes.length === 1 ? "Percebi 1 coisa:" : `Percebi ${themes.length} coisas:`;
  const amb = pendingAmbiguities(themes, links);
  const tail = amb.length
    ? formatAmbiguityQuestion(amb[0])
    : "Confirmas? Ainda não gravei nada. Podes corrigir ponto a ponto antes de eu guardar — nome, telefone, tipologia, zona, valor ou data (ex.: \"o 1 é T2\", \"no 1 o valor são 250 mil\", \"o 2 é dia 14/09\") — ou descartar um ponto (ex.: \"descarta o 2\").";
  const confidential = themes.some((t) => t.confidential);
  const privacy = confidential
    ? "\n\nA nota confidencial fica só para ti — nunca sai em nada que eu prepare para outra pessoa."
    : "";
  return `${head}\n\n${lines.join("\n")}${privacy}\n\n${tail}`;
}

export function formatThemesRevised(themes: AudioTheme[], links: ThemeLinks[], note: string): string {
  const lines = themes.map((t, i) => `${themeNumber(i)} ${formatThemeLine(t, links[i] ?? emptyLinks())}`);
  return `${note}\n\n${lines.join("\n")}\n\nAssim está certo? Guardo?`;
}

// ---- Recibo de escrita -----------------------------------------------------

export interface ThemeWriteResult {
  personName?: string | null;
  personCreated?: boolean;
  propertyTitle?: string | null;
  propertyCreated?: boolean;
  opportunityTitle?: string | null;
  opportunityCreated?: boolean;
  opportunityLinked?: boolean;
  followUpTitle?: string | null;
  noteSaved?: boolean;
}

/** Diz o quê + onde, sem prometer envios. */
export function formatThemesDone(results: ThemeWriteResult[]): string {
  const sentences: string[] = [];
  for (const r of results) {
    const bits: string[] = [];
    if (r.personName) bits.push(`o contacto ${r.personName}${r.personCreated ? "" : " (já existia, liguei ao teu)"}`);
    if (r.propertyTitle) bits.push(`o imóvel "${r.propertyTitle}"${r.propertyCreated ? "" : " (já existia)"}`);
    if (r.opportunityTitle) {
      bits.push(
        r.opportunityCreated
          ? `a oportunidade "${r.opportunityTitle}"`
          : `a ligação à oportunidade "${r.opportunityTitle}" que já tinhas`,
      );
    }
    if (bits.length) sentences.push(`Guardei ${listPt(bits)} em Negócios, no dashboard, ligados entre si.`);
    if (r.followUpTitle) sentences.push(`Guardei o seguimento "${r.followUpTitle}" em Seguimentos, no dashboard.`);
    if (r.noteSaved) sentences.push("Guardei a nota no histórico do contacto, no dashboard.");
  }
  if (!sentences.length) return "Não consegui guardar nada deste áudio. Queres tentar outra vez?";
  sentences.push("Não enviei nada a ninguém.");
  return sentences.join(" ");
}

function listPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

// ---- Correcções tema-a-tema ------------------------------------------------

export interface ThemeEdit {
  index: number;
  remove?: boolean;
  title?: string;
  personName?: string;
  personPhone?: string;
  typology?: string;
  location?: string;
  address?: string;
  price?: number;
  intent?: ThemeIntent;
  urgency?: ThemeUrgency;
  motivation?: string;
  date?: string;
  time?: string;
  clearDate?: boolean;
}

function strip(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function readIndex(plain: string, count: number): number | null {
  // Percorre todos os números soltos: "no 2 o preço são 250 mil" tem dois
  // números e só o primeiro dentro do intervalo é o ponto a corrigir.
  const re = /(?:^|\b)(?:o|no|na|do|da|item|ponto|tema|numero|n[ºo])?\s*(\d{1,2})(?=\b|[.,:)])/g;
  for (const m of plain.matchAll(re)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= count) return n - 1;
  }
  const words: Record<string, number> = { primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3, quarto: 4, quarta: 4 };
  for (const [w, n] of Object.entries(words)) {
    if (plain.includes(w) && n <= count) return n - 1;
  }
  return null;
}

const PT_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Datas escritas à portuguesa: 12/09, 12-09-2026, "12 de setembro". */
function readPtDate(plain: string, today: string): string | null {
  const iso = plain.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = plain.match(/\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let y = slash[3] ? Number(slash[3]) : Number(today.slice(0, 4));
      if (y < 100) y += 2000;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const named = plain.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/);
  if (named) {
    const m = PT_MONTHS[named[2]];
    const d = Number(named[1]);
    if (m && d >= 1 && d <= 31) {
      const y = named[3] ? Number(named[3]) : Number(today.slice(0, 4));
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

/** Valores à portuguesa: "250 mil", "250.000", "1,2 milhões", "320000 euros". */
function readPrice(plain: string): number | null {
  const hasCue = /\b(preco|valor|pede|pedem|pedia|vale|custa|por|euros?|€|mil|milhoes|milhao)\b|€/.test(plain);
  if (!hasCue) return null;
  const m = plain.match(/(\d[\d.\s]*(?:,\d+)?)\s*(milhoes|milhao|mil|k|€|euros?)?/);
  if (!m) return null;
  const digits = m[1].replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  let n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (unit === "mil" || unit === "k") n *= 1000;
  else if (unit === "milhoes" || unit === "milhao") n *= 1_000_000;
  return n >= 1000 ? Math.round(n) : null;
}

export function parseThemeEdit(message: string, count: number, today: string): ThemeEdit | null {
  const plain = strip(message).replace(/\s+/g, " ");
  if (!plain || count === 0) return null;
  const index = readIndex(plain, count);
  if (index === null) return null;

  if (/\b(descarta|apaga|elimina|tira|remove|esquece)\b/.test(plain)) {
    return { index, remove: true };
  }
  const edit: ThemeEdit = { index };
  const typ = plain.match(/\bt(\d)\b/);
  if (typ) edit.typology = `T${typ[1]}`;
  const loc = message.match(/\bem\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'’-]*(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'’-]*)*)/);
  if (loc) edit.location = loc[1].trim();

  // Entidades: nome e telefone do contacto do tema.
  const nameM = message.match(/(?:chama-se|o nome (?:e|é)|nao (?:e|é) .{1,40}?,?\s*(?:mas\s+)?(?:sim|e|é))\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'’.-]*(?:\s+(?:de|da|do|dos|das)?\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ'’.-]*)*)/);
  if (nameM) edit.personName = nameM[1].replace(/\s+/g, " ").trim().slice(0, 120);
  if (/\b(telefone|telemovel|contacto|numero|tlm|tlf)\b/.test(plain)) {
    const tel = message.match(/(\+?\d[\d\s]{7,15}\d)/);
    if (tel) {
      const digits = tel[1].replace(/\s/g, "");
      if (digits.replace(/\D/g, "").length >= 9) edit.personPhone = digits;
    }
  }

  // Valores e intenção.
  const price = readPrice(plain.replace(/(?:^|\b)(?:o|no|na|do|da|item|ponto|tema|numero|n[ºo])\s*\d{1,2}\b/, " "));
  if (price) edit.price = price;
  const intentM = plain.match(/\b(?:e|é|para|quer)\s+(vender|comprar|arrendar|avaliar)\b/);
  if (intentM) edit.intent = intentM[1] as ThemeIntent;
  if (/\bnao\s+(?:e|é)\s+urgente\b|\bsem\s+pressa\b/.test(plain)) edit.urgency = "baixa";
  else if (/\b(e|é)\s+urgente\b|\bcom\s+pressa\b/.test(plain)) edit.urgency = "alta";
  const motiv = plain.match(/\b(?:motivo|porque|porqu[eê]|razao)\s*(?:e|é|:)?\s+(.{3,120})$/);
  if (motiv) edit.motivation = motiv[1].trim();

  // Datas.
  if (/\bdepois de amanha\b/.test(plain)) edit.date = addDays(today, 2);
  else if (/\bamanha\b/.test(plain)) edit.date = addDays(today, 1);
  else if (/\bhoje\b/.test(plain)) edit.date = today;
  const explicit = readPtDate(plain, today);
  if (explicit) edit.date = explicit;
  if (/\b(sem data|tira a data|sem prazo|nao (?:e|é) para data)\b/.test(plain)) {
    edit.clearDate = true;
    delete edit.date;
  }
  const time = plain.match(/\b(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|horas)?\b/);
  if (time && /\b(?:as|às|as\s)\s*\d/.test(plain)) {
    edit.time = `${time[1].padStart(2, "0")}:${time[2] ?? "00"}`;
  }
  const quoted = message.match(/["“”'](.+?)["“”']/);
  if (quoted) edit.title = quoted[1].trim().slice(0, 200);

  const touched =
    edit.typology || edit.location || edit.address || edit.date || edit.time || edit.title ||
    edit.personName || edit.personPhone || edit.price || edit.intent || edit.urgency ||
    edit.motivation || edit.clearDate;
  return touched ? edit : null;
}

export function applyThemeEdit(themes: AudioTheme[], links: ThemeLinks[], edit: ThemeEdit): {
  themes: AudioTheme[];
  links: ThemeLinks[];
} {
  if (edit.remove) {
    return {
      themes: themes.filter((_, i) => i !== edit.index),
      links: links.filter((_, i) => i !== edit.index),
    };
  }
  const next = themes.map((t, i) => {
    if (i !== edit.index) return t;
    const copy: AudioTheme = JSON.parse(JSON.stringify(t));
    if (edit.title) copy.title = edit.title;
    if (edit.personName || edit.personPhone) {
      const base = copy.person ?? { name: null, phone: null, role: null };
      copy.person = {
        ...base,
        name: edit.personName ?? base.name,
        phone: edit.personPhone ?? base.phone,
      };
    }
    if (edit.typology) copy.property = { ...(copy.property ?? { typology: null, location: null, address: null, features: null, price: null }), typology: edit.typology };
    if (edit.location) copy.property = { ...(copy.property ?? { typology: null, location: null, address: null, features: null, price: null }), location: edit.location };
    if (edit.address) copy.property = { ...(copy.property ?? { typology: null, location: null, address: null, features: null, price: null }), address: edit.address };
    if (edit.price) copy.property = { ...(copy.property ?? { typology: null, location: null, address: null, features: null, price: null }), price: edit.price };
    if (edit.intent || edit.urgency || edit.motivation) {
      const base = copy.opportunity ?? { intent: null, motivation: null, urgency: null, deadline: null };
      copy.opportunity = {
        ...base,
        intent: edit.intent ?? base.intent,
        urgency: edit.urgency ?? base.urgency,
        motivation: edit.motivation ?? base.motivation,
      };
    }
    if (edit.clearDate && copy.next_action) {
      copy.next_action.date = null;
      copy.next_action.time = null;
    }
    if ((edit.date || edit.time) && copy.next_action) {
      if (edit.date) copy.next_action.date = edit.date;
      if (edit.time) copy.next_action.time = edit.time;
    }
    if ((edit.date || edit.clearDate) && !copy.next_action && copy.opportunity) {
      copy.opportunity.deadline = edit.clearDate ? null : (edit.date ?? null);
    }
    return copy;
  });
  // Corrigir a entidade invalida a ligação que tinha sido adivinhada por
  // deduplicação: o consultor está a dizer que não é aquele registo.
  const nextLinks = links.map((l, i) => {
    if (i !== edit.index) return l;
    let out = l;
    if (edit.typology || edit.location || edit.address) {
      out = { ...out, property_id: null, property_label: null, ambiguous_properties: [] };
    }
    if (edit.personName || edit.personPhone) {
      out = { ...out, person_id: null, person_label: null, ambiguous_people: [] };
    }
    return out;
  });
  return { themes: next, links: nextLinks };
}

function eur(n: number): string {
  return `${new Intl.NumberFormat("pt-PT").format(n)} €`;
}

/** O que mudou, em palavras, para o consultor perceber sem reler tudo. */
export function describeThemeEditChanges(edit: ThemeEdit): string[] {
  const bits: string[] = [];
  if (edit.personName) bits.push(`contacto: ${edit.personName}`);
  if (edit.personPhone) bits.push(`telefone: ${edit.personPhone}`);
  if (edit.typology) bits.push(`tipologia: ${edit.typology}`);
  if (edit.location) bits.push(`zona: ${edit.location}`);
  if (edit.address) bits.push(`morada: ${edit.address}`);
  if (edit.price) bits.push(`valor: ${eur(edit.price)}`);
  if (edit.intent) bits.push(`intenção: ${edit.intent}`);
  if (edit.urgency) bits.push(`urgência: ${edit.urgency}`);
  if (edit.motivation) bits.push(`motivo: ${edit.motivation}`);
  if (edit.clearDate) bits.push("sem data");
  else if (edit.date) bits.push(`data: ${ptDate(edit.date, edit.time ?? null)}`);
  else if (edit.time) bits.push(`hora: ${edit.time}`);
  if (edit.title) bits.push(`título: ${edit.title}`);
  return bits;
}

export function describeThemeEdit(edit: ThemeEdit, removed?: AudioTheme): string {
  if (edit.remove) return `Está bem, tirei o ponto ${edit.index + 1}${removed ? ` (${removed.title})` : ""}. Fica assim:`;
  const bits = describeThemeEditChanges(edit);
  if (!bits.length) return `Corrigi o ponto ${edit.index + 1}. Fica assim:`;
  return `Corrigi o ponto ${edit.index + 1} (${listPt(bits)}). Ainda não gravei nada. Fica assim:`;
}

/** O consultor escolheu um dos contactos ambíguos? */
export function matchAmbiguityAnswer(message: string, candidates: ThemeCandidate[]): ThemeCandidate | null {
  const plain = strip(message);
  if (!plain) return null;
  const num = plain.match(/^(?:o\s+)?(\d)$/);
  if (num) {
    const c = candidates[Number(num[1]) - 1];
    if (c) return c;
  }
  let best: ThemeCandidate | null = null;
  for (const c of candidates) {
    const label = strip(c.label);
    if (!label) continue;
    if (plain.includes(label) || label.includes(plain)) {
      if (!best || label.length > strip(best.label).length) best = c;
    }
  }
  return best;
}

/** Heurística barata: vale a pena tentar separar em temas? */
export function worthThemeSegmentation(transcript: string): boolean {
  const t = String(transcript ?? "").trim();
  return t.length >= 60;
}

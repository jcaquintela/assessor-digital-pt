// Qualificação de compradores — extração determinística dos critérios.
//
// Regra action-first: com tipologia + zona + orçamento aproximado já se age.
// Cada critério fica marcado como "confirmado" (dito pelo consultor) ou
// "assumido" (deduzido por nós, sempre mostrado como tal). O que já foi dito
// nunca volta a ser perguntado.

import { foldText } from "@/lib/search/normalize";

export type CriterionStatus = "confirmed" | "assumed";

export interface Criterion<T> {
  value: T;
  status: CriterionStatus;
  /** Explicação curta quando é assumido. */
  note?: string;
}

export interface BuyerBrief {
  buyerName: Criterion<string> | null;
  typology: Criterion<string> | null;
  propertyType: Criterion<string> | null;
  zone: Criterion<string> | null;
  /** Teto de preço do imóvel. */
  budgetMax: Criterion<number> | null;
  financingApproved: Criterion<number> | null;
  ownFunds: Criterion<number> | null;
  /** YYYY-MM-DD */
  deadline: Criterion<string> | null;
  nearMetro: Criterion<boolean> | null;
  /** Referências ZMPT e links que o consultor deu. */
  refs: string[];
  links: string[];
}

export function emptyBrief(): BuyerBrief {
  return {
    buyerName: null, typology: null, propertyType: null, zone: null, budgetMax: null,
    financingApproved: null, ownFunds: null, deadline: null, nearMetro: null, refs: [], links: [],
  };
}

const c = <T>(value: T): Criterion<T> => ({ value, status: "confirmed" });

// --- Deteção ----------------------------------------------------------------

const BUYER_SIGNAL_RE =
  /\b(comprador(?:a|es)?|quer(?:em)? comprar|para comprar|procura(?:m)?\s+(?:um|uma|casa|apartamento|moradia|t\s?\d)|anda(?:m)? (?:a|à) procura|pre-?aprova(?:cao|do|da)|credito aprovado)\b/;

export function hasBuyerSignal(text: string): boolean {
  return BUYER_SIGNAL_RE.test(foldText(text));
}

/** Mensagem de qualificação de comprador: sinal de comprador + pelo menos um critério. */
export function isBuyerQualification(text: string): boolean {
  if (!hasBuyerSignal(text)) return false;
  const b = extractBuyerBrief(text);
  return !!(b.typology || b.zone || b.budgetMax || b.financingApproved);
}

// --- Extração ---------------------------------------------------------------

const KNOWN_ZONES = [
  "vila nova de gaia", "gaia", "porto", "matosinhos", "maia", "gondomar", "valongo", "espinho",
  "povoa de varzim", "vila do conde", "santa maria da feira", "lisboa", "oeiras", "cascais",
  "sintra", "amadora", "odivelas", "loures", "almada", "seixal", "setubal", "barreiro",
  "braga", "coimbra", "aveiro", "faro", "mafamude", "canidelo", "oliveira do douro",
  "vilar de andorinho", "madalena", "arcozelo", "valadares", "boavista", "foz", "paranhos",
  "ramalde", "campanha", "bonfim", "cedofeita", "leca da palmeira", "senhora da hora",
];
const ZONE_LABEL: Record<string, string> = {
  "vila nova de gaia": "Vila Nova de Gaia", "povoa de varzim": "Póvoa de Varzim",
  "santa maria da feira": "Santa Maria da Feira", setubal: "Setúbal", "leca da palmeira": "Leça da Palmeira",
  campanha: "Campanhã", "oliveira do douro": "Oliveira do Douro", "vilar de andorinho": "Vilar de Andorinho",
  "senhora da hora": "Senhora da Hora", "vila do conde": "Vila do Conde",
};
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(De|Do|Da|Dos|Das)\b/g, (m) => m.toLowerCase());

const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** "150k", "150 mil", "150.000€", "150 000 euros" → 150000. Só valores ≥ 10 000. */
function parseMoney(raw: string): number | null {
  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|mil|m|€|euros?)?/);
  if (!m) return null;
  let n = Number(m[1]!.replace(/[.\s](?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (m[2] === "k" || m[2] === "mil") n *= 1000;
  else if (m[2] === "m" && n < 20) n *= 1_000_000;
  return n >= 10_000 && n <= 50_000_000 ? Math.round(n) : null;
}

const MONEY_RE = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|mil|€|euros?)?(?![\d/])/gi;

function moneyIn(text: string): number[] {
  const out: number[] = [];
  MONEY_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = MONEY_RE.exec(text))) {
    const v = parseMoney(mm[0]);
    if (v != null) out.push(v);
  }
  return out;
}

/**
 * Valor junto de uma palavra-chave: primeiro logo a seguir ("pré-aprovação
 * até 150k"), senão logo antes ("15k de capitais próprios").
 */
function moneyNear(fold: string, keyRe: RegExp): number | null {
  const m = keyRe.exec(fold);
  if (!m) return null;
  const after = moneyIn(fold.slice(m.index + m[0].length, m.index + m[0].length + 30));
  if (after.length) return after[0]!;
  const before = moneyIn(fold.slice(Math.max(0, m.index - 14), m.index));
  return before.length ? before[before.length - 1]! : null;
}

function toIsoDate(d: number, mo: number, now: Date): string | null {
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  let y = now.getUTCFullYear();
  const candidate = Date.UTC(y, mo - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (candidate < today) y += 1;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function extractBuyerBrief(text: string, now: Date = new Date()): BuyerBrief {
  const b = emptyBrief();
  const raw = String(text ?? "");
  const fold = foldText(raw);

  const typ = fold.match(/\bt\s?([0-6])(?:\s?\+\s?1)?\b/);
  if (typ) b.typology = c(`T${typ[1]}`);
  const kind = fold.match(/\b(apartamento|moradia|casa|terreno|loja|escritorio)\b/);
  if (kind) b.propertyType = c(kind[1]!);

  // Zona: lista conhecida (a mais longa ganha) ou nome próprio após preposição.
  const known = KNOWN_ZONES.filter((z) => new RegExp(`\\b${z}\\b`).test(fold)).sort((a, x) => x.length - a.length)[0];
  if (known) b.zone = c(ZONE_LABEL[known] ?? titleCase(known));

  const name = raw.match(/\b(?:comprador(?:a)?|cliente)[,:]?\s+(?:(?:o|a)\s+)?(?:chamad[oa]\s+)?([A-ZÀ-Ý][a-zà-ÿ]+)/)
    ?? raw.match(/^\s*(?:[OoAa]\s+)?([A-ZÀ-Ý][a-zà-ÿ]+)\s*(?:[,:-]|\b(?:procura|quer|anda|tem)\b)/);
  if (name && !KNOWN_ZONES.includes(foldText(name[1]))) {
    const n = name[1]!;
    if (!/^(Olá|Ola|Tenho|Preciso|Um|Uma|Comprador|Cliente|Afonso|Ele|Ela|Eles|Elas|Sim|Não|Nao|Ok|Também|Tambem|Mas|E|Já|Ja)$/i.test(n)) b.buyerName = c(n);
  }

  const fin = moneyNear(fold, /pre-?aprova\w*|credito (?:aprovado|pre-?aprovado)|financiamento(?: aprovado)?/);
  if (fin) b.financingApproved = c(fin);
  const own = moneyNear(fold, /capita(?:l|is)(?: proprios?)?|entrada|poupancas?|dinheiro proprio/);
  if (own) b.ownFunds = c(own);
  const budget = moneyNear(fold, /orcamento|budget|teto|maximo|ate(?! (?:dia|ao dia|\d{1,2}\s*(?:\/|de )))/);
  if (budget && budget !== fin && budget !== own) b.budgetMax = c(budget);

  // Prazo: "prazo 30/11", "até 30/11", "até 30 de novembro", "até ao fim de novembro".
  const dm = fold.match(/\b(?:prazo|ate|antes de|limite)\D{0,12}(\d{1,2})\s*[/.-]\s*(\d{1,2})\b/);
  const dl = fold.match(/\b(?:prazo|ate|antes de|limite)\D{0,12}(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
  const iso = dm ? toIsoDate(Number(dm[1]), Number(dm[2]), now)
    : dl ? toIsoDate(Number(dl[1]), MONTHS[dl[2]!]!, now) : null;
  if (iso) b.deadline = c(iso);

  if (/\b(perto|junto|ao pe|proximo|a \d+ ?min(?:utos)?) (?:d[oa] |de (?:uma )?)?(?:metro|estacao de metro)\b/.test(fold)) {
    b.nearMetro = c(true);
  }

  b.refs = Array.from(new Set((raw.match(/\bZMPT[-\s]?\d{3,}\b/gi) ?? []).map((r) => r.toUpperCase().replace(/\s/g, "-"))));
  b.links = Array.from(new Set(raw.match(/https?:\/\/[^\s<>()]+/g) ?? []));
  return withAssumptions(b);
}

/** Custos de aquisição assumidos (IMT, imposto do selo, escritura e registo). */
export const ACQUISITION_COSTS_PCT = 0.08;

/**
 * Teto assumido a partir de pré-aprovação + capitais próprios, descontando
 * custos de aquisição. Nunca substitui um orçamento dito pelo consultor.
 */
export function withAssumptions(b: BuyerBrief): BuyerBrief {
  if (b.budgetMax?.status === "confirmed") return b;
  const fin = b.financingApproved?.value ?? null;
  if (fin == null) {
    if (b.budgetMax?.status === "assumed") b.budgetMax = null;
    return b;
  }
  const own = b.ownFunds?.value ?? 0;
  const ceiling = Math.floor((fin + own) / (1 + ACQUISITION_COSTS_PCT) / 1000) * 1000;
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  b.budgetMax = {
    value: ceiling,
    status: "assumed",
    note: own
      ? `pré-aprovação ${k(fin)} + ${k(own)} de capitais, descontando ~8% de impostos e escritura`
      : `pré-aprovação ${k(fin)}, descontando ~8% de impostos e escritura`,
  };
  return b;
}

export interface BriefChange { field: keyof BuyerBrief; from: string; to: string }

const FIELDS: Array<keyof BuyerBrief> = [
  "buyerName", "typology", "propertyType", "zone", "budgetMax", "financingApproved", "ownFunds", "deadline", "nearMetro",
];

function show(v: unknown): string {
  if (typeof v === "number") return `${Math.round(v).toLocaleString("pt-PT")} €`;
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

/**
 * Junta o que já se sabia com a mensagem nova. Valores ditos agora ganham;
 * uma mudança num valor já confirmado fica registada para ser dita ao consultor.
 */
export function mergeBriefs(prev: BuyerBrief, next: BuyerBrief): { brief: BuyerBrief; changes: BriefChange[] } {
  const out: BuyerBrief = { ...prev, refs: [...prev.refs], links: [...prev.links] };
  const changes: BriefChange[] = [];
  for (const f of FIELDS) {
    const n = next[f] as Criterion<unknown> | null;
    if (!n || n.status !== "confirmed") continue;
    const p = prev[f] as Criterion<unknown> | null;
    if (p && p.status === "confirmed" && p.value !== n.value) {
      changes.push({ field: f, from: show(p.value), to: show(n.value) });
    }
    (out as any)[f] = n;
  }
  out.refs = Array.from(new Set([...out.refs, ...next.refs]));
  out.links = Array.from(new Set([...out.links, ...next.links]));
  // O teto assumido é sempre recalculado a partir do que está confirmado.
  if (out.budgetMax?.status === "assumed") out.budgetMax = null;
  return { brief: withAssumptions(out), changes };
}

/** Junta uma sequência de mensagens do consultor (mais antiga primeiro). */
export function briefFromMessages(messages: string[], now: Date = new Date()): { brief: BuyerBrief; changes: BriefChange[] } {
  let brief = emptyBrief();
  let changes: BriefChange[] = [];
  for (const m of messages) {
    const r = mergeBriefs(brief, extractBuyerBrief(m, now));
    brief = r.brief;
    changes = r.changes; // só interessam as mudanças da última mensagem
  }
  return { brief, changes };
}

/** Critérios mínimos para agir: tipologia (ou tipo), zona e orçamento aproximado. */
export function missingMinimum(b: BuyerBrief): Array<"typology" | "zone" | "budget"> {
  const miss: Array<"typology" | "zone" | "budget"> = [];
  if (!b.typology && !b.propertyType) miss.push("typology");
  if (!b.zone) miss.push("zone");
  if (!b.budgetMax) miss.push("budget");
  return miss;
}

export function hasMinimumCriteria(b: BuyerBrief): boolean {
  return missingMinimum(b).length === 0;
}

/** Urgente quando o prazo está a 21 dias ou menos. */
export const URGENT_DAYS = 21;

export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = Date.UTC(y!, m! - 1, d!);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 864e5);
}

export function isUrgent(b: BuyerBrief, now: Date = new Date()): boolean {
  if (!b.deadline) return false;
  const n = daysUntil(b.deadline.value, now);
  return n >= 0 && n <= URGENT_DAYS;
}

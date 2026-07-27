// Cultura conversacional — camada determinística para mensagens curtas.
//
// Módulo puro (sem I/O) que reconhece confirmações, recusas, saudações,
// agradecimentos, correções, datas/horas e "mais uma".
// É invocado antes da IA sempre que exista contexto suficiente
// (ver `engine.server.ts`).

import { resolveDateTimeFromText, hasExplicitDateTime } from "../date-resolver";

// ------------------------------------------------------------------
// Regexes — mantidas em sincronia com as versões históricas do engine.
// ------------------------------------------------------------------

export const CONFIRM_RE =
  /^\s*(sim(,?\s*(regista|registar|regista isso|faz isso|por favor))?|regista(r)?|regista isso|confirma(r|do)?|pode ser|est[áa] bem|ok(ay|ei)?|claro|com certeza|faz isso|dale|👍|✅|sim!?)\s*[.!]?\s*$/i;

export const CANCEL_RE =
  /^\s*(n[ãa]o|nao|cancela(r)?|esquece|deixa|para|n[ãa]o registes|n[ãa]o registar)\s*[.!]?\s*$/i;

export const GREET_RE =
  /^\s*(ol[áa]|oi|hey|hi|hello|bom\s*dia|boa\s*tarde|boa\s*noite)\b[\s,.!?]*$/i;

export const THANKS_RE =
  /^\s*(obrigad[oa]|obrigadinho|thanks|thank\s*you|valeu|grato|grata)\b[\s,.!?]*$/i;

export const MORE_RE =
  /\b(mais\s+uma|mais\s+um|outra|outro|tenho\s+outra|tenho\s+mais)\b/i;

export const CORRECTION_RE =
  /^\s*(n[ãa]o[,.\s]|nao[,.\s]|mas\b|afinal\b|antes\b|corrige\b|corrigir\b|[ée]\s+(às|as|pelas|amanh|hoje|com|na|no|em)|na\s+verdade\b)/i;

// Substituição de pessoa: "não é Paulo, é Pedro", "afinal é o Pedro".
export const PERSON_SWAP_RE =
  /\b(?:n[ãa]o\s+[ée]\s+(?:o\s+|a\s+)?([\p{L}][\p{L}\-']+)[,.\s]+[ée]\s+(?:o\s+|a\s+)?([\p{L}][\p{L}\-']+))|(?:afinal\s+[ée]\s+(?:o\s+|a\s+)?([\p{L}][\p{L}\-']+))/iu;

// ------------------------------------------------------------------
// Predicados
// ------------------------------------------------------------------

export function isConfirmation(text: string): boolean {
  return CONFIRM_RE.test(text);
}

export function isRejection(text: string): boolean {
  return CANCEL_RE.test(text);
}

export function isGreeting(text: string): boolean {
  return GREET_RE.test(text);
}

export function isThanks(text: string): boolean {
  return THANKS_RE.test(text);
}

export function wantsAnother(text: string): boolean {
  return MORE_RE.test(text) && !hasExplicitDateTime(text);
}

export function detectCorrection(text: string): boolean {
  return CORRECTION_RE.test(text);
}

// ------------------------------------------------------------------
// Extração pura
// ------------------------------------------------------------------

export function extractShortDate(text: string, now: Date = new Date()): string | null {
  return resolveDateTimeFromText(text, now).date;
}

export function extractShortTime(text: string, now: Date = new Date()): string | null {
  // "meio-dia" e "meia-noite" — atalhos comuns em PT-PT.
  if (/\bmeio[-\s]?dia\b/i.test(text)) return "12:00";
  if (/\bmeia[-\s]?noite\b/i.test(text)) return "00:00";
  const bare = text.match(/\b(\d{1,2})\s*horas?\b/i);
  if (bare) {
    const h = parseInt(bare[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }
  return resolveDateTimeFromText(text, now).time;
}

// ------------------------------------------------------------------
// Classificador agregador
// ------------------------------------------------------------------

export type ShortAnswerKind =
  | "confirmation"
  | "rejection"
  | "greeting"
  | "thanks"
  | "another"
  | "correction"
  | "date_only"
  | "time_only"
  | "datetime"
  | "unknown";

export interface ShortAnswer {
  kind: ShortAnswerKind;
  date: string | null;
  time: string | null;
}

export function classifyShortAnswer(
  text: string,
  now: Date = new Date(),
): ShortAnswer {
  const t = (text ?? "").trim();
  if (!t) return { kind: "unknown", date: null, time: null };
  if (isConfirmation(t)) return { kind: "confirmation", date: null, time: null };
  if (isRejection(t)) return { kind: "rejection", date: null, time: null };
  if (isGreeting(t)) return { kind: "greeting", date: null, time: null };
  if (isThanks(t)) return { kind: "thanks", date: null, time: null };
  const date = extractShortDate(t, now);
  const time = extractShortTime(t, now);
  if (detectCorrection(t)) return { kind: "correction", date, time };
  if (wantsAnother(t)) return { kind: "another", date, time };
  if (date && time) return { kind: "datetime", date, time };
  if (date) return { kind: "date_only", date, time: null };
  if (time) return { kind: "time_only", date: null, time };
  return { kind: "unknown", date: null, time: null };
}
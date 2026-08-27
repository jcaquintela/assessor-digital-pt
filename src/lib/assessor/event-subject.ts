// Chave de assunto partilhada para compromissos.
//
// Bug real (11/08): de manhã ficou "Consulta endocrinologista" às 09:00; à
// noite a consultora escreveu "Tenho consulta com a endocrinologista às
// 10:30" — a MESMA consulta, nova hora. Como os títulos não eram iguais, o
// motor criou um segundo compromisso e o briefing da manhã seguinte usou a
// hora antiga. Numa consulta médica real isso é grave.
//
// Regra: antes de criar, procurar um compromisso do mesmo assunto no mesmo
// dia (ou no dia seguinte). Havendo correspondência provável com hora
// diferente, NUNCA assumir — perguntar se é actualização ou compromisso novo.

import { lisbonHhMm, lisbonYmd } from "./lisbon-day";

const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "do", "da", "dos", "das", "com", "sem",
  "em", "no", "na", "nos", "nas", "para", "pra", "por", "ao", "aos", "e", "que",
  "the", "at", "hoje", "amanha", "ontem", "manha", "tarde", "noite", "hora", "horas",
  "sr", "sra", "dona", "dr", "dra", "meu", "minha", "tenho", "vou", "ir",
]);

function fold(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Radical simples: aproxima "endocrinologista" de "endocrinologia". */
function stem(token: string): string {
  return token.length >= 8 ? token.slice(0, 7) : token;
}

/** Tokens significativos de um título, sem acentos nem palavras vazias. */
export function subjectTokens(title: string | null | undefined): string[] {
  return fold(title ?? "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map(stem);
}

/** Chave estável do assunto (ordem das palavras não conta). */
export function subjectKey(title: string | null | undefined): string {
  return [...new Set(subjectTokens(title))].sort().join("-");
}

/** Semelhança de assunto entre dois títulos (0..1, Jaccard sobre radicais). */
export function subjectSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = new Set(subjectTokens(a));
  const B = new Set(subjectTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** Data local de Lisboa (YYYY-MM-DD) a partir de um instante ISO/UTC. */
export function lisbonYmdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return lisbonYmd(iso) || null;
}

/** Hora local de Lisboa (HH:MM) a partir de um instante ISO/UTC. */
export function lisbonHhMmFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return lisbonHhMm(iso) || null;
}

function daysApart(a: string, b: string): number {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 99;
  return Math.abs(Math.round((ta - tb) / 86_400_000));
}

export interface ExistingEventLite {
  id: string;
  title: string | null;
  /** timestamptz do compromisso. */
  due_date: string | null;
  due_time?: string | null;
}

export interface IncomingEvent {
  title: string;
  /** YYYY-MM-DD local. */
  date: string;
  /** HH:MM local. */
  time: string;
}

export interface RescheduleCandidate {
  id: string;
  title: string;
  date: string;
  time: string;
}

const SIMILARITY_FLOOR = 0.34;

/**
 * Devolve o compromisso já existente que este novo pedido provavelmente
 * actualiza — mesmo assunto, mesmo dia (ou dia seguinte), hora diferente.
 * Devolve null quando não há dúvida razoável.
 */
export function findRescheduleCandidate(
  existing: ExistingEventLite[],
  incoming: IncomingEvent,
): RescheduleCandidate | null {
  const incomingKey = subjectKey(incoming.title);
  if (!incomingKey) return null;

  let best: { row: ExistingEventLite; score: number; ymd: string; hm: string } | null = null;
  for (const row of existing) {
    const ymd = lisbonYmdFromIso(row.due_date);
    if (!ymd || daysApart(ymd, incoming.date) > 1) continue;
    const hm = (row.due_time && /^\d{2}:\d{2}/.test(row.due_time))
      ? row.due_time.slice(0, 5)
      : (lisbonHhMmFromIso(row.due_date) ?? "");
    // Mesma data e mesma hora = já é o mesmo registo; nada a perguntar.
    if (ymd === incoming.date && hm === incoming.time) continue;
    const score = subjectSimilarity(row.title, incoming.title);
    if (score < SIMILARITY_FLOOR) continue;
    if (!best || score > best.score) best = { row, score, ymd, hm };
  }
  if (!best) return null;
  return {
    id: best.row.id,
    title: (best.row.title ?? "").trim() || "Compromisso",
    date: best.ymd,
    time: best.hm,
  };
}

/** Pergunta em PT-PT — nunca assumimos silenciosamente. */
export function rescheduleQuestion(
  candidate: RescheduleCandidate,
  incoming: IncomingEvent,
): string {
  const quando = candidate.date === incoming.date ? "" : ` (${candidate.date})`;
  return `Já tinhas "${candidate.title}" às ${candidate.time}${quando} — isto actualiza a hora para ${incoming.time}, ou é um compromisso diferente?`;
}

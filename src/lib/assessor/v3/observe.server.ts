// Reasoning Engine — Fase 1: OBSERVE.
//
// Extração determinística de sinais crus da mensagem. Nunca decide,
// nunca interpreta intenção. Devolve apenas o que está objectivamente
// presente no texto para alimentar a fase THINK.

import type { Observation } from "./types";

const PHONE_RE = /\b(?:\+?351\s?)?9\d{2}\s?\d{3}\s?\d{3}\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const AMOUNT_RE = /\b\d{1,3}(?:[.\s]?\d{3})*(?:[,.]\d+)?\s?(?:k€|€|eur|euros|k\b)?/gi;
const TIME_RE = /\b\d{1,2}[:h]\d{2}\b|\b\d{1,2}\s?h\b/gi;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const TYPOLOGY_RE = /\b[TVvt]\s?\d\b/g;
const URL_RE = /https?:\/\/\S+/gi;

const DOCUMENT_HINTS = /\b(cpu|crp|caderneta\s+predial|caderneta|escritura|licen[çc]a|contrato|proposta|reserva|planta|certificado\s+energ[eé]tico|ficha\s+t[eé]cnica|placa|foto|documento|pdf|anexo)\b/gi;
const VERBS = /\b(agenda|agendar|marca|marcar|liga|ligar|liguei|contact[ae]|ver|visita|visitei|reunia?[ãa]o|reuni|criar|apagar|remover|actualiza|atualiza|guarda|guardar|regista|registar|envia|enviei|falei|combinei|marquei|comprei|vendi|angari(?:ei|ou|ar))\b/gi;
const REFERENCE = /\b(o|a|ao|à|com o|com a|aquele|aquela|esse|essa|este|esta)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)\b/g;
const SHORT_ANSWER = /^\s*(sim|s|nao|não|n|ok|okay|claro|certo|combinado|cancela|cancelar|esquece)\s*[.!?]*\s*$/i;
const GREETING = /^\s*(bom\s+dia|boa\s+tarde|boa\s+noite|ol[áa]|hey|oi)\b/i;
const TONE_NEG = /\b(difícil|dificil|frustrante|cansado|chato|complicado|impossível|impossivel|péssimo|pessimo)\b/gi;
// Morada / localidade: apanha nomes próprios após palavras-chave de zona.
const ADDRESS_HINT = /\b(rua|avenida|av\.?|travessa|largo|pra[çc]a|estrada|urbaniza[çc][ãa]o|edif[íi]cio|zona\s+de|em|no|na)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ .]+/g;
// Localidades soltas em capitalizadas (dois tokens capitalizados seguidos).
const PROPER_TWO = /\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+){0,2}\b/g;

function pushMatches(
  out: Observation[],
  re: RegExp,
  text: string,
  type: Observation["type"],
  transform: (m: string) => string = (m) => m.trim(),
) {
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const v = transform(m[0]);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push({ type, value: v, raw: m[0] });
  }
}

export function observe(input: string): Observation[] {
  const out: Observation[] = [];
  const text = input ?? "";

  pushMatches(out, PHONE_RE, text, "phone", (m) => m.replace(/\s+/g, ""));
  pushMatches(out, EMAIL_RE, text, "email");
  pushMatches(out, URL_RE, text, "url");
  pushMatches(out, TIME_RE, text, "time");
  pushMatches(out, ISO_DATE_RE, text, "date");
  pushMatches(out, TYPOLOGY_RE, text, "typology", (m) => m.toUpperCase().replace(/\s+/g, ""));
  pushMatches(out, DOCUMENT_HINTS, text, "document_hint", (m) => m.toLowerCase());
  pushMatches(out, VERBS, text, "verb", (m) => m.toLowerCase());
  pushMatches(out, TONE_NEG, text, "tone", (m) => m.toLowerCase());
  pushMatches(out, ADDRESS_HINT, text, "address", (m) => m.trim());
  pushMatches(out, AMOUNT_RE, text, "amount", (m) => m.trim());

  if (SHORT_ANSWER.test(text)) out.push({ type: "short_answer", value: text.trim().toLowerCase() });
  if (GREETING.test(text)) out.push({ type: "greeting", value: text.trim() });

  // Referências pronominais / vocativos ("o Paulo", "aquele imóvel")
  const refSeen = new Set<string>();
  for (const m of text.matchAll(REFERENCE)) {
    const key = m[0].toLowerCase();
    if (refSeen.has(key)) continue;
    refSeen.add(key);
    out.push({ type: "reference", value: m[2], raw: m[0] });
  }

  // Nomes próprios soltos (só se ainda não vieram como reference).
  const nameSeen = new Set(out.filter((o) => o.type === "reference").map((o) => o.value.toLowerCase()));
  for (const m of text.matchAll(PROPER_TWO)) {
    const v = m[0].trim();
    if (nameSeen.has(v.toLowerCase())) continue;
    // Ignora início de frase capitalizado (heurística: ignora se estiver na posição 0).
    if (m.index === 0) continue;
    if (v.length < 3) continue;
    nameSeen.add(v.toLowerCase());
    out.push({ type: "name", value: v });
  }

  return out;
}
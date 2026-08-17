// Dedupe de imóveis por morada.
//
// Mesma disciplina do dedupe de pessoas (`src/lib/people/name-match.ts`):
// normalizar os dois lados, comparar por palavras inteiras e classificar a
// qualidade da correspondência. Nunca decide sozinho — só assinala, e quem
// cria confirma explicitamente.

import { foldText } from "@/lib/search/normalize";

/** Abreviaturas de arruamento que não distinguem moradas nenhumas. */
const TIPOS_VIA: Record<string, string> = {
  r: "rua", rua: "rua",
  av: "avenida", avn: "avenida", avenida: "avenida",
  tv: "travessa", trv: "travessa", travessa: "travessa",
  pc: "praceta", praceta: "praceta",
  pr: "praca", praca: "praca",
  lg: "largo", largo: "largo",
  est: "estrada", estrada: "estrada",
  al: "alameda", alameda: "alameda",
  bc: "beco", beco: "beco",
};

/** Palavras de ligação que não acrescentam identidade à morada. */
const VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "no", "na", "nos", "nas", "em", "a", "o", "n", "nº", "num"]);

/**
 * Morada comparável: sem acentos, sem pontuação, com tipos de via expandidos
 * e sem palavras de ligação. "Av. da Boavista, 245" → "avenida boavista 245".
 */
export function normalizeAddress(input: string | null | undefined): string {
  const bruto = foldText(input).replace(/[.,;:/\\|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!bruto) return "";
  return bruto
    .split(" ")
    .map((w) => TIPOS_VIA[w] ?? w)
    .filter((w) => w && !VAZIAS.has(w))
    .join(" ");
}

/** Só as palavras que dão identidade (ignora o tipo de via em si). */
function tokensIdentidade(norm: string): string[] {
  const tipos = new Set(Object.values(TIPOS_VIA));
  return norm.split(" ").filter((w) => w.length > 1 && !tipos.has(w));
}

/** Número de porta, quando existe. Distingue nº 12 de nº 120. */
export function doorNumber(norm: string): string | null {
  const nums = norm.split(" ").filter((w) => /^\d+[a-z]?$/.test(w));
  return nums.length ? nums[nums.length - 1] : null;
}

export type AddressMatch = "igual" | "provavel" | "diferente";

/**
 * Qualidade da correspondência entre duas moradas.
 *   igual     → mesma morada normalizada (mesmo número de porta)
 *   provavel  → mesmas palavras de identidade, número ausente ou diferente
 *   diferente → não vale a pena perguntar
 */
export function addressMatchQuality(a: string | null | undefined, b: string | null | undefined): AddressMatch {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return "diferente";
  if (na === nb) return "igual";

  const ta = tokensIdentidade(na);
  const tb = tokensIdentidade(nb);
  if (!ta.length || !tb.length) return "diferente";

  const setB = new Set(tb);
  const comuns = ta.filter((t) => setB.has(t));
  // Exigir que o lado mais curto esteja inteiro contido no outro: evita o
  // falso positivo clássico de duas ruas que só partilham a localidade.
  const menor = Math.min(ta.length, tb.length);
  if (comuns.length < menor || menor < 1) return "diferente";

  const da = doorNumber(na);
  const db = doorNumber(nb);
  if (da && db && da === db) return "igual";
  return "provavel";
}

export type AddressCandidate = { id: string; title?: string | null; address?: string | null; status?: string | null };

/**
 * Possíveis duplicados de uma morada, melhores primeiro. Nunca bloqueia a
 * criação: devolve o que há para o consultor decidir.
 */
export function findAddressDuplicates<T extends AddressCandidate>(
  address: string | null | undefined,
  candidates: T[],
  excludeId?: string | null,
): { item: T; quality: Exclude<AddressMatch, "diferente"> }[] {
  const alvo = normalizeAddress(address);
  if (!alvo) return [];
  const out: { item: T; quality: Exclude<AddressMatch, "diferente"> }[] = [];
  for (const c of candidates) {
    if (excludeId && c.id === excludeId) continue;
    const q = addressMatchQuality(address, c.address || c.title);
    if (q !== "diferente") out.push({ item: c, quality: q });
  }
  return out.sort((x, y) => (x.quality === y.quality ? 0 : x.quality === "igual" ? -1 : 1));
}
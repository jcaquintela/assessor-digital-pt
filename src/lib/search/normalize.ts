// Pesquisa insensível a acentos.
//
// Caso real (07/08): "Sergio Canelas" não encontrava "Sérgio Canelas".
// Regra: normalizar sempre os dois lados — minúsculas e sem diacríticos.
// Na base de dados existem colunas geradas (`name_norm`, `search_norm`,
// `title_norm`) calculadas com `public.text_norm()`, que faz exactamente o
// mesmo. Quem pesquisa texto usa essas colunas com `foldText(query)`.

/** Minúsculas, sem acentos, espaços colapsados. */
export function foldText(input: string | null | undefined): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Termo pronto para `ilike` numa coluna normalizada (sem wildcards do utilizador). */
export function foldLike(input: string | null | undefined): string {
  return foldText(input).replace(/[%_]/g, "");
}

/** `true` se o texto contém o termo, ignorando acentos e maiúsculas. */
export function foldIncludes(haystack: string | null | undefined, needle: string): boolean {
  const n = foldText(needle);
  if (!n) return true;
  return foldText(haystack).includes(n);
}

/**
 * Palavras da pesquisa, normalizadas e sem wildcards, para correspondências
 * parciais que atravessam várias palavras ("sergio can" → ["sergio", "can"]).
 */
export function searchTokens(input: string | null | undefined, minLength = 2, max = 6): string[] {
  return foldText(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= minLength)
    .map((t) => t.replace(/[%_]/g, ""))
    .filter(Boolean)
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Fuzzy: pequenas diferenças (gralhas, letra a mais/a menos) ainda casam.
// O limiar é curto de propósito — palavras curtas não toleram erros, porque
// "sol" e "sal" são coisas diferentes; só palavras longas ganham folga.
// ---------------------------------------------------------------------------

/** Máximo de letras diferentes toleradas num pedaço, por comprimento. */
export function fuzzyMaxEdits(len: number): number {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  return 2;
}

/** Crédito de um pedaço aproximado face a um exacto (nunca ultrapassa o exacto). */
export const FUZZY_CREDIT = 0.6;

/** Resultados abaixo desta fracção do melhor são ruído e não aparecem. */
export const RELEVANCE_FLOOR = 0.5;

function levenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 1 quando o pedaço aparece tal e qual, `FUZZY_CREDIT` quando aparece com uma
 * gralha pequena numa das palavras do texto, 0 quando não aparece.
 */
export function fuzzyTokenHit(haystack: string | null | undefined, token: string): number {
  const text = foldText(haystack);
  if (!token) return 0;
  if (text.includes(token)) return 1;
  const max = fuzzyMaxEdits(token.length);
  if (max === 0) return 0;
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    // Comparar com o prefixo do tamanho do pedaço permite casar dentro de
    // palavras maiores ("canelaz" em "canelas de cima").
    const slice = word.slice(0, Math.min(word.length, token.length + max));
    if (levenshtein(slice, token, max) <= max) return FUZZY_CREDIT;
  }
  return 0;
}

/** Mantém só os resultados relevantes face ao melhor (corta ruído do fuzzy). */
export function filterByRelevance<T extends { score: number }>(rows: T[], floor = RELEVANCE_FLOOR): T[] {
  const best = rows.reduce((m, r) => Math.max(m, r.score), 0);
  if (best <= 0) return [];
  return rows.filter((r) => r.score >= best * floor);
}

/**
 * Qualidade de uma correspondência parcial: quantos pedaços casaram e quão
 * próximos ficaram no texto. "sergio can" deve preferir "Sérgio Canelas"
 * (dois pedaços colados) a "Sérgio Matos ... Cancelas do Norte".
 */
export function tokenMatchScore(
  haystack: string | null | undefined,
  tokens: string[],
): { hits: number; spread: number } {
  const folded = foldText(haystack);
  const positions: number[] = [];
  for (const t of tokens) {
    const i = folded.indexOf(t);
    if (i >= 0) positions.push(i);
  }
  if (!positions.length) return { hits: 0, spread: Number.MAX_SAFE_INTEGER };
  const spread = Math.max(...positions) - Math.min(...positions);
  return { hits: positions.length, spread };
}

/** Ordena melhores primeiro: mais pedaços, depois contexto mais próximo. */
export function compareTokenMatches(
  a: { hits: number; spread: number },
  b: { hits: number; spread: number },
): number {
  return b.hits - a.hits || a.spread - b.spread;
}

/**
 * Campo pesquisável com o peso que tem na relevância. Nome e título valem
 * mais do que morada ou resumo: quem escreve "sol matosinhos" quer o imóvel
 * cujo título fala do Sol, não um qualquer com a morada parecida.
 */
export type WeightedField = { text: string | null | undefined; weight: number };

/**
 * Pontuação ponderada: cada pedaço conta o peso do melhor campo onde aparece.
 * `spread` continua a medir a proximidade dos pedaços, no campo que mais
 * pedaços apanhou (desempate por contexto mais próximo).
 * Determinística — a ordenação (estável) nunca muda entre execuções.
 */
export function weightedTokenMatchScore(
  fields: WeightedField[],
  tokens: string[],
): { hits: number; spread: number } {
  const folded = fields.map((f) => ({ text: foldText(f.text), weight: f.weight }));
  let hits = 0;
  for (const t of tokens) {
    let best = 0;
    for (const f of folded) {
      const credit = f.weight * fuzzyTokenHit(f.text, t);
      if (credit > best) best = credit;
    }
    hits += best;
  }
  if (hits === 0) return { hits: 0, spread: Number.MAX_SAFE_INTEGER };

  let spread = Number.MAX_SAFE_INTEGER;
  let bestCount = 0;
  for (const f of folded) {
    const m = tokenMatchScore(f.text, tokens);
    if (m.hits === 0) continue;
    if (m.hits > bestCount || (m.hits === bestCount && m.spread < spread)) {
      bestCount = m.hits;
      spread = m.spread;
    }
  }
  return { hits, spread };
}

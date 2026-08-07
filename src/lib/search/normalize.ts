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

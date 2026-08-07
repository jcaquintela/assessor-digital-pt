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

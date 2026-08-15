// Vista de cartões de categoria do Drive Inteligente.
// Função pura: decide o que cada cartão mostra e o que acontece ao clicar.
// Poucos ficheiros → abre ali mesmo. Muitos → vale a pena uma página só dela.

import type { DriveGroup } from "./group-files";

/** Acima deste número, abrir a categoria numa vista dedicada. */
export const INLINE_LIMIT = 15;

export type CategoryCard<F> = {
  key: string;
  label: string;
  count: number;
  destaque?: boolean;
  /** true → expande por baixo do cartão; false → navega para vista dedicada. */
  inline: boolean;
  files: F[];
};

export function buildCategoryCards<F>(groups: DriveGroup<F>[], limit = INLINE_LIMIT): CategoryCard<F>[] {
  return groups
    .filter((g) => g.files.length > 0)
    .map((g) => ({
      key: g.key,
      label: g.label || "Todos",
      count: g.files.length,
      destaque: g.destaque,
      inline: g.files.length <= limit,
      files: g.files,
    }));
}

/**
 * A vista de cartões só é usada no agrupamento por categoria e sem pesquisa
 * activa: pesquisar tem de continuar a atravessar todas as categorias.
 */
export function shouldShowCards(opts: {
  groupBy: string;
  query?: string | null;
  nif?: string | null;
  artigo?: string | null;
  openCategory?: string | null;
}): boolean {
  if (opts.groupBy !== "categoria") return false;
  if (opts.openCategory) return false;
  return !(opts.query?.trim() || opts.nif?.trim() || opts.artigo?.trim());
}

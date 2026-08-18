// Vista de cartões de categoria do Drive Inteligente.
// Delega no motor partilhado (`src/lib/ui/group-cards.ts`) usado por Imóveis,
// Negócios, Faturação e Pessoas — aqui com `keepEmpty:false`, porque as
// categorias do Drive são dinâmicas (criadas pelo consultor ou pelo sistema),
// ao contrário dos grupos canónicos dos outros módulos.

import type { DriveGroup } from "./group-files";
import { buildGroupCards, INLINE_LIMIT as SHARED_LIMIT, type GroupCard } from "@/lib/ui/group-cards";

/** Acima deste número, abrir a categoria numa vista dedicada. */
export const INLINE_LIMIT = SHARED_LIMIT;

/** Igual ao cartão partilhado; `files` é o nome que o Drive já usava. */
export type CategoryCard<F> = GroupCard<F> & { files: F[] };

export function buildCategoryCards<F>(groups: DriveGroup<F>[], limit = INLINE_LIMIT): CategoryCard<F>[] {
  return buildGroupCards(
    groups.map((g) => ({ key: g.key, label: g.label || "Todos", items: g.files, destaque: g.destaque })),
    limit,
    false,
  ).map((c) => ({ ...c, files: c.items }));
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

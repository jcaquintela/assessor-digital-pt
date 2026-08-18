// Estado das categorias do Drive vive no URL, no mesmo parâmetro `grp` usado
// por Imóveis, Negócios, Faturação e Pessoas. O cartão decide sozinho se abre
// inline (poucos ficheiros) ou em vista dedicada, por isso um único parâmetro
// chega. Links antigos (`cat=` dedicada, `exp=` inline) continuam a funcionar:
// são reencaminhados para `grp=`.

export type DriveSearch = {
  tab?: string;
  q?: string;
  nif?: string;
  artigo?: string;
  grp?: string;
  /** @deprecated link antigo — redireccionado para `grp`. */
  cat?: string;
  /** @deprecated link antigo — redireccionado para `grp`. */
  exp?: string;
};

/** Link antigo? Devolve o search já normalizado; senão, null. */
export function legacySearch(s: DriveSearch): DriveSearch | null {
  const antigo = s.cat ?? s.exp;
  if (!antigo) return null;
  return { ...s, grp: s.grp ?? antigo, cat: undefined, exp: undefined };
}

/** O que o URL diz que está aberto. A pesquisa manda: é transversal. */
export function resolveCategoryView(
  s: DriveSearch,
  inline?: (key: string) => boolean,
): { mode: "cartoes" | "expandido" | "dedicada" | "pesquisa"; key: string | null } {
  const pesquisa = !!(s.q?.trim() || s.nif?.trim() || s.artigo?.trim());
  if (pesquisa) return { mode: "pesquisa", key: null };
  const key = s.grp ?? s.cat ?? s.exp ?? null;
  if (!key) return { mode: "cartoes", key: null };
  return { mode: inline?.(key) ? "expandido" : "dedicada", key };
}

/** Próximo estado do URL ao clicar num cartão (toggle). */
export function nextSearchForCard(s: DriveSearch, key: string): DriveSearch {
  return { ...s, cat: undefined, exp: undefined, grp: s.grp === key ? undefined : key };
}

/** Fechar a categoria aberta. */
export function closedSearch(s: DriveSearch): DriveSearch {
  return { ...s, grp: undefined, cat: undefined, exp: undefined };
}

/** Link partilhável: só o essencial para reabrir exactamente esta vista. */
export function categoryShareUrl(origin: string, pathname: string, s: DriveSearch, key: string) {
  const p = new URLSearchParams();
  if (s.tab) p.set("tab", s.tab);
  p.set("grp", key);
  return `${origin}${pathname}?${p.toString()}`;
}

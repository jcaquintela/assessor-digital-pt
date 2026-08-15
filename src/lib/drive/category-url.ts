// Estado das categorias do Drive vive no URL: `cat` = vista dedicada,
// `exp` = cartão expandido inline. Assim o link é partilhável e o
// back/forward do browser repõe sempre o mesmo ecrã.

export type DriveSearch = {
  tab?: string;
  q?: string;
  nif?: string;
  artigo?: string;
  cat?: string;
  exp?: string;
};

/** O que o URL diz que está aberto. A pesquisa manda: é transversal. */
export function resolveCategoryView(s: DriveSearch): {
  mode: "cartoes" | "expandido" | "dedicada" | "pesquisa";
  key: string | null;
} {
  const pesquisa = !!(s.q?.trim() || s.nif?.trim() || s.artigo?.trim());
  if (pesquisa) return { mode: "pesquisa", key: null };
  if (s.cat) return { mode: "dedicada", key: s.cat };
  if (s.exp) return { mode: "expandido", key: s.exp };
  return { mode: "cartoes", key: null };
}

/** Próximo estado do URL ao clicar num cartão (toggle no caso inline). */
export function nextSearchForCard(s: DriveSearch, key: string, inline: boolean): DriveSearch {
  if (inline) return { ...s, cat: undefined, exp: s.exp === key ? undefined : key };
  return { ...s, cat: key, exp: undefined };
}

/** Fechar a categoria aberta, seja ela inline ou dedicada. */
export function closedSearch(s: DriveSearch): DriveSearch {
  return { ...s, cat: undefined, exp: undefined };
}

/** Link partilhável: só o essencial para reabrir exactamente esta vista. */
export function categoryShareUrl(origin: string, pathname: string, s: DriveSearch, key: string, inline: boolean) {
  const p = new URLSearchParams();
  if (s.tab) p.set("tab", s.tab);
  p.set(inline ? "exp" : "cat", key);
  return `${origin}${pathname}?${p.toString()}`;
}

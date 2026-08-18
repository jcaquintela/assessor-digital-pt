// Navegação por cartões, generalizada a partir do padrão já validado no Drive
// (`src/lib/drive/category-cards.ts` + `category-url.ts`).
//
// Mesma disciplina: funções puras, sem React e sem BD. Os módulos (Imóveis,
// Negócios, Faturação) só ligam a UI a estas funções.

/** Acima deste número, o grupo abre em vista dedicada em vez de expandir. */
export const INLINE_LIMIT = 15;

export type GroupInput<T> = {
  key: string;
  label: string;
  items: T[];
  destaque?: boolean;
  /** Nota curta ao lado do rótulo (ex.: "automática" no Drive). */
  hint?: string;
};

export type GroupCard<T> = {
  key: string;
  label: string;
  count: number;
  /** true → expande por baixo do cartão; false → vale uma vista dedicada. */
  inline: boolean;
  items: T[];
  /** Cartão a chamar a atenção (ex.: "Por categorizar" no Drive). */
  destaque?: boolean;
  /** Nota curta ao lado do rótulo. */
  hint?: string;
};

/**
 * Constrói os cartões. Por omissão os grupos canónicos aparecem sempre, mesmo
 * a zero: um estado vazio é informação, esconder o cartão é que confunde.
 * (O Drive tem o seu próprio módulo e mantém-se como está.)
 */
export function buildGroupCards<T>(
  groups: GroupInput<T>[],
  limit = INLINE_LIMIT,
  keepEmpty = true,
): GroupCard<T>[] {
  return groups
    .filter((g) => keepEmpty || g.items.length > 0)
    .map((g) => ({
      key: g.key,
      label: g.label,
      count: g.items.length,
      inline: g.items.length <= limit,
      items: g.items,
      destaque: g.destaque,
      hint: g.hint,
    }));
}

export type CardsSearch = { q?: string; grp?: string };

/**
 * O que o URL diz que está aberto. A pesquisa manda: é sempre transversal a
 * todos os grupos, tal como no Drive.
 */
export function resolveCardsView(s: CardsSearch): {
  mode: "cartoes" | "aberto" | "pesquisa";
  key: string | null;
} {
  if (s.q?.trim()) return { mode: "pesquisa", key: null };
  if (s.grp) return { mode: "aberto", key: s.grp };
  return { mode: "cartoes", key: null };
}

/** Próximo estado do URL ao clicar num cartão (toggle). */
export function nextSearchForGroup(s: CardsSearch, key: string): CardsSearch {
  return { ...s, grp: s.grp === key ? undefined : key };
}

/** Fechar o grupo aberto. */
export function closedGroupSearch(s: CardsSearch): CardsSearch {
  return { ...s, grp: undefined };
}

/** Link partilhável: só o essencial para reabrir exactamente esta vista. */
export function groupShareUrl(
  origin: string,
  pathname: string,
  key: string,
  extra?: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
  p.set("grp", key);
  return `${origin}${pathname}?${p.toString()}`;
}
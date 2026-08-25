// Cartões e chips de categoria da Agenda Inteligente.
// Delega no motor partilhado (`src/lib/ui/group-cards.ts`) — o mesmo do Drive,
// Imóveis, Negócios, Pessoas e Faturação.

import { buildGroupCards, type GroupCard } from "@/lib/ui/group-cards";
import {
  EVENT_CATEGORY_LABEL,
  EVENT_CATEGORY_ORDER,
  EVENT_CATEGORY_SHORT,
  HIDDEN_BY_DEFAULT,
  effectiveEventCategory,
  type EventCategoryKey,
} from "./event-category";

export type AgendaCategoryItem = {
  id: string;
  event_category?: string | null;
  event_category_id?: string | null;
};

export type AgendaCategoryLike = { id: string; name: string };

const oculta = (k: string) => HIDDEN_BY_DEFAULT.includes(k as EventCategoryKey);

/**
 * Agrupa compromissos por categoria efectiva. Categorias manuais aparecem com
 * o nome escolhido pelo consultor; as automáticas levam o prefixo `sys:` e o
 * hint "automática", como no Drive.
 */
export function buildEventCategoryCards<T extends AgendaCategoryItem>(
  events: T[],
  categories: AgendaCategoryLike[] = [],
  opts: { mostrarAniversarios?: boolean } = {},
): GroupCard<T>[] {
  const manuais = new Map(categories.map((c) => [c.id, c.name]));
  const buckets = new Map<string, T[]>();
  for (const e of events) {
    const { key } = effectiveEventCategory(e);
    // Categoria manual apagada entretanto: cai na automática.
    const finalKey = key.startsWith("sys:") || manuais.has(key) ? key : "sys:por_classificar";
    if (!buckets.has(finalKey)) buckets.set(finalKey, []);
    buckets.get(finalKey)!.push(e);
  }

  const groups: { key: string; label: string; items: T[]; destaque?: boolean; hint?: string }[] = [];

  for (const k of EVENT_CATEGORY_ORDER) {
    if (oculta(k) && !opts.mostrarAniversarios) continue;
    const items = buckets.get(`sys:${k}`) ?? [];
    if (!items.length && k !== "por_classificar") continue;
    groups.push({
      key: `sys:${k}`,
      label: EVENT_CATEGORY_LABEL[k],
      items,
      // "Por classificar" nunca é escondido e chama sempre a atenção.
      destaque: k === "por_classificar",
      hint: "automática",
    });
  }

  for (const [id, name] of manuais) {
    const items = buckets.get(id) ?? [];
    if (!items.length) continue;
    groups.push({ key: id, label: name, items });
  }

  return buildGroupCards(groups, undefined, true);
}

/** Chips de filtro das vistas temporais. Aniversários só com activação explícita. */
export function eventCategoryChips(opts: { mostrarAniversarios?: boolean } = {}): {
  key: string;
  label: string;
}[] {
  const chips = [{ key: "todos", label: "Todos" }];
  for (const k of EVENT_CATEGORY_ORDER) {
    if (oculta(k) && !opts.mostrarAniversarios) continue;
    chips.push({ key: k, label: EVENT_CATEGORY_SHORT[k] });
  }
  return chips;
}

/** Filtra eventos pelo chip activo. */
export function filterByCategoryChip<T extends AgendaCategoryItem>(
  events: T[],
  chip: string,
  opts: { mostrarAniversarios?: boolean } = {},
): T[] {
  return events.filter((e) => {
    const { key } = effectiveEventCategory(e);
    const auto = key.startsWith("sys:") ? key.slice(4) : null;
    if (!opts.mostrarAniversarios && auto === "aniversarios") return false;
    if (chip === "todos" || !chip) return true;
    return auto === chip;
  });
}

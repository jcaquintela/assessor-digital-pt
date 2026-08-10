// Módulo puro: o que conta como "sugestão para a equipa do Afonso".
//
// As sugestões chegaram por dois caminhos ao longo do tempo:
//  1. product_feedback (kind = "suggestion") — caminho actual do motor;
//  2. miscellaneous_items com categoria/título de sugestão — caminho antigo,
//     que deixava a sugestão presa em Diversos e invisível para a equipa.
// O admin agrega os dois; este módulo define a regra, para os dois lados
// (consultor e admin) concordarem sempre.

import { foldText } from "@/lib/search/normalize";

export const TEAM_SUGGESTION_NOTE =
  "Sugestão registada — visível para a equipa do Afonso.";
export const TEAM_READ_LABEL = "Recebida pela equipa";
export const TEAM_PENDING_LABEL = "Visível para a equipa";

export interface MiscLike {
  title?: string | null;
  category?: string | null;
  summary?: string | null;
  tags?: string[] | null;
}

/** Uma nota de Diversos que é, na verdade, uma sugestão para a equipa. */
export function isTeamSuggestion(item: MiscLike): boolean {
  const category = foldText(item.category ?? "");
  if (category.startsWith("sugest")) return true;
  const title = foldText(item.title ?? "");
  if (title.startsWith("sugest")) return true;
  const tags = (item.tags ?? []).map((t) => foldText(t));
  return tags.some((t) => t.startsWith("sugest"));
}

/** Estado que o consultor vê no cartão da sugestão. */
export function teamStateLabel(readAt: string | null | undefined): string {
  return readAt ? TEAM_READ_LABEL : TEAM_PENDING_LABEL;
}
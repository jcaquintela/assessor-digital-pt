// Guardião de confidencialidade.
//
// Uma nota marcada como confidencial pertence ao consultor e a mais ninguém.
// Pode aparecer no dashboard e nas respostas ao próprio consultor, mas NUNCA
// pode entrar em texto destinado a terceiros (proprietários, compradores,
// colegas) — nem em resumos, nem em rascunhos de mensagens, nem em partilhas.
//
// Qualquer construtor de texto "para fora" tem de passar as interações por
// `dropConfidential()` antes de as usar.

export const CONFIDENTIAL_BADGE = "Confidencial";

export interface MaybeConfidential {
  is_confidential?: boolean | null;
  summary?: string | null;
  [key: string]: unknown;
}

/** Remove tudo o que está marcado como confidencial. */
export function dropConfidential<T extends MaybeConfidential>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter((r) => r?.is_confidential !== true);
}

/** Filtro a aplicar a queries Supabase de interações destinadas a texto externo. */
export function outwardInteractionFilter(query: any): any {
  return query.eq("is_confidential", false);
}

/** Palavras que o consultor usa para marcar algo como confidencial. */
const CONFIDENTIAL_HINTS = [
  "confidencial",
  "só para mim",
  "so para mim",
  "entre nós",
  "entre nos",
  "não partilhes",
  "nao partilhes",
  "não digas a ninguém",
  "nao digas a ninguem",
  "off the record",
];

export function looksConfidential(text: string | null | undefined): boolean {
  const t = String(text ?? "").toLowerCase();
  return CONFIDENTIAL_HINTS.some((h) => t.includes(h));
}
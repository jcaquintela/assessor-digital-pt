// Cartões canónicos de Pessoas. Puro: sem React, sem BD.
//
// Regra de produto (a mesma de Imóveis/Negócios/Faturação): os grupos
// canónicos aparecem SEMPRE, mesmo a zero. Um cartão a zero é informação;
// esconder o cartão é que confunde.
//
// Duas fontes de categoria convivem na base: `people.roles` (array do enum
// person_role) e `people.relationship_type` (texto livre, com maiúsculas e
// acentos inconsistentes). Normalizamos as duas para as mesmas chaves.

import { buildGroupCards, type GroupCard } from "@/lib/ui/group-cards";

export const PEOPLE_CATEGORIES = [
  { key: "proprietarios", label: "Proprietários" },
  { key: "potenciais_proprietarios", label: "Potenciais proprietários" },
  { key: "compradores", label: "Compradores" },
  { key: "potenciais_compradores", label: "Potenciais compradores" },
  { key: "clientes", label: "Clientes" },
  { key: "potenciais_clientes", label: "Potenciais clientes" },
  { key: "rede", label: "Rede" },
  { key: "sem_categoria", label: "Sem categoria" },
] as const;

export type PeopleCategoryKey = (typeof PEOPLE_CATEGORIES)[number]["key"];

export const SEM_CATEGORIA: PeopleCategoryKey = "sem_categoria";

/** Tira acentos, espaços e maiúsculas — "Proprietário" e "proprietario" são o mesmo. */
export function token(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

const MAPA: Record<string, PeopleCategoryKey> = {
  owner: "proprietarios",
  proprietario: "proprietarios",
  potential_owner: "potenciais_proprietarios",
  potencial_proprietario: "potenciais_proprietarios",
  buyer: "compradores",
  comprador: "compradores",
  potential_buyer: "potenciais_compradores",
  potencial_comprador: "potenciais_compradores",
  // Lead ainda sem intenção fechada: pode ser compra, venda ou arrendamento.
  // Não assumimos comprador — tem cartão próprio.
  potencial_cliente: "potenciais_clientes",
  potencial: "potenciais_clientes",
  client: "clientes",
  cliente: "clientes",
  reference: "rede",
  referenciador: "rede",
  partner: "rede",
  parceiro: "rede",
  supplier: "rede",
  fornecedor: "rede",
  colleague: "rede",
  colega: "rede",
  other: "rede",
  outro: "rede",
};

export type PersonLike = { id: string; papeis?: string[] | null; relacao?: string | null };

/**
 * Rótulo humano (singular) para a etiqueta da lista. Só UI: não altera dados.
 * Deliberadamente NÃO promove `potencial_cliente` a "Potencial comprador" —
 * o dado cru não diz se a pessoa quer comprar, vender ou arrendar.
 */
const ROTULOS: Record<string, string> = {
  owner: "Proprietário",
  proprietario: "Proprietário",
  potential_owner: "Potencial proprietário",
  potencial_proprietario: "Potencial proprietário",
  buyer: "Comprador",
  comprador: "Comprador",
  potential_buyer: "Potencial comprador",
  potencial_comprador: "Potencial comprador",
  potencial_cliente: "Potencial cliente",
  potencial: "Potencial cliente",
  client: "Cliente",
  cliente: "Cliente",
  reference: "Referenciador",
  referenciador: "Referenciador",
  partner: "Parceiro",
  parceiro: "Parceiro",
  supplier: "Fornecedor",
  fornecedor: "Fornecedor",
  colleague: "Colega",
  colega: "Colega",
  other: "Rede",
  outro: "Rede",
};

export function relationLabel(raw?: string | null): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const t = token(v);
  if (ROTULOS[t]) return ROTULOS[t];
  // Sem tradução conhecida: pelo menos tira o snake_case.
  const bonito = v.replace(/[_-]+/g, " ").trim();
  return bonito.charAt(0).toUpperCase() + bonito.slice(1);
}

/**
 * Categorias de uma pessoa. Pode devolver mais do que uma — é por isso que a
 * soma dos cartões pode exceder o total de pessoas.
 */
export function personCategoryKeys(p: PersonLike): PeopleCategoryKey[] {
  const out = new Set<PeopleCategoryKey>();
  for (const raw of [...(p.papeis ?? []), p.relacao ?? ""]) {
    const k = MAPA[token(String(raw ?? ""))];
    if (k) out.add(k);
  }
  return out.size ? [...out] : [SEM_CATEGORIA];
}

/** Cartões por categoria, na ordem canónica, com os vazios incluídos. */
export function peopleCategoryCards<T extends PersonLike>(pessoas: T[]): GroupCard<T>[] {
  const porChave = new Map<string, T[]>();
  for (const p of pessoas) {
    for (const k of personCategoryKeys(p)) porChave.set(k, [...(porChave.get(k) ?? []), p]);
  }
  return buildGroupCards(
    PEOPLE_CATEGORIES.map((c) => ({ key: c.key, label: c.label, items: porChave.get(c.key) ?? [] })),
  );
}

/** Soma das contagens dos cartões (pode ser maior que o total de pessoas). */
export function cardsSum<T>(cards: GroupCard<T>[]): number {
  return cards.reduce((n, c) => n + c.count, 0);
}

/**
 * Nota de rodapé para o consultor. Só aparece quando a soma excede o total —
 * caso contrário seria ruído.
 */
export function multiRoleNote<T>(cards: GroupCard<T>[], total: number): string | null {
  const soma = cardsSum(cards);
  if (soma <= total) return null;
  return `Os cartões somam ${soma}, mais do que as ${total} pessoas: quem tem vários papéis (por exemplo proprietário e comprador) conta em cada cartão.`;
}

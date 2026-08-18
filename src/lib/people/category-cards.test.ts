import { describe, expect, it } from "vitest";
import {
  PEOPLE_CATEGORIES,
  cardsSum,
  multiRoleNote,
  peopleCategoryCards,
  personCategoryKeys,
} from "./category-cards";

const p = (id: string, papeis: string[] = [], relacao?: string) => ({ id, papeis, relacao });

describe("cartões canónicos de Pessoas", () => {
  it("mostra sempre os 7 grupos, mesmo sem ninguém", () => {
    const cards = peopleCategoryCards([]);
    expect(cards.map((c) => c.key)).toEqual(PEOPLE_CATEGORIES.map((c) => c.key));
    expect(cards.every((c) => c.count === 0)).toBe(true);
  });

  it("potencial_cliente tem cartão próprio, não conta como comprador", () => {
    const cards = peopleCategoryCards([p("1", [], "potencial_cliente")]);
    expect(cards.find((c) => c.key === "potenciais_clientes")!.count).toBe(1);
    expect(cards.find((c) => c.key === "potenciais_compradores")!.count).toBe(0);
  });

  it("não esconde grupos vazios quando há pessoas noutro grupo", () => {
    const cards = peopleCategoryCards([p("1", ["owner"])]);
    expect(cards).toHaveLength(PEOPLE_CATEGORIES.length);
    expect(cards.find((c) => c.key === "proprietarios")!.count).toBe(1);
    expect(cards.find((c) => c.key === "compradores")!.count).toBe(0);
  });

  it("normaliza acentos e maiúsculas do relationship_type", () => {
    expect(personCategoryKeys(p("1", [], "Proprietário"))).toEqual(["proprietarios"]);
    expect(personCategoryKeys(p("2", [], "proprietario"))).toEqual(["proprietarios"]);
  });

  it("agrupa reference/partner/supplier/colleague/other em Rede", () => {
    for (const r of ["reference", "partner", "supplier", "colleague", "other"]) {
      expect(personCategoryKeys(p("x", [r]))).toEqual(["rede"]);
    }
  });

  it("quem não tem papel nem relação cai em Sem categoria", () => {
    expect(personCategoryKeys(p("1"))).toEqual(["sem_categoria"]);
    expect(personCategoryKeys(p("2", [], ""))).toEqual(["sem_categoria"]);
  });

  it("GOLDEN: roles=[owner, buyer] conta em Proprietários E Compradores", () => {
    const cards = peopleCategoryCards([p("1", ["owner", "buyer"])]);
    expect(cards.find((c) => c.key === "proprietarios")!.count).toBe(1);
    expect(cards.find((c) => c.key === "compradores")!.count).toBe(1);
    expect(cards.find((c) => c.key === "sem_categoria")!.count).toBe(0);
    expect(cardsSum(cards)).toBe(2);
    // A UI tem de explicar a diferença entre a soma (2) e o total (1).
    expect(multiRoleNote(cards, 1)).toContain("vários papéis");
  });

  it("sem papéis múltiplos, não há nota nenhuma", () => {
    const cards = peopleCategoryCards([p("1", ["owner"]), p("2", ["buyer"])]);
    expect(multiRoleNote(cards, 2)).toBeNull();
  });
});

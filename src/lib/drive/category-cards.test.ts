import { describe, it, expect } from "vitest";
import { groupDriveFiles } from "./group-files";
import { buildCategoryCards, shouldShowCards, INLINE_LIMIT } from "./category-cards";

const mk = (n: number, sys: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `${sys}-${i}`, custom_category_id: null, system_category: sys }));

describe("cartões de categoria", () => {
  const files = [...mk(3, "contactos"), ...mk(20, "documentos")];
  const cards = buildCategoryCards(groupDriveFiles(files, {}, [], "categoria"));

  it("categoria com 3 itens expande inline", () => {
    const c = cards.find((x) => x.label === "Cartões de visita")!;
    expect(c.inline).toBe(true);
    expect(c.files).toHaveLength(3);
  });

  it("categoria com 20+ itens vai para vista dedicada", () => {
    const c = cards.find((x) => x.label === "Documentos")!;
    expect(c.inline).toBe(false);
    expect(c.count).toBe(20);
  });

  it("contagem bate certo com o total real", () => {
    expect(cards.reduce((n, c) => n + c.count, 0)).toBe(files.length);
  });

  it("limite é 15 inclusive", () => {
    const c = buildCategoryCards(groupDriveFiles(mk(INLINE_LIMIT, "notas"), {}, [], "categoria"));
    expect(c[0].inline).toBe(true);
    const d = buildCategoryCards(groupDriveFiles(mk(INLINE_LIMIT + 1, "notas"), {}, [], "categoria"));
    expect(d[0].inline).toBe(false);
  });

  it("'Por categorizar' continua visível como cartão próprio", () => {
    const g = groupDriveFiles([{ id: "x", custom_category_id: null, system_category: null }], {}, [], "categoria");
    expect(buildCategoryCards(g).map((c) => c.label)).toEqual(["Por categorizar"]);
  });

  it("pesquisa desliga os cartões (resultados cross-categoria)", () => {
    expect(shouldShowCards({ groupBy: "categoria" })).toBe(true);
    expect(shouldShowCards({ groupBy: "categoria", query: "ana" })).toBe(false);
    expect(shouldShowCards({ groupBy: "categoria", nif: "123" })).toBe(false);
    expect(shouldShowCards({ groupBy: "lista" })).toBe(false);
    expect(shouldShowCards({ groupBy: "categoria", openCategory: "sys:documentos" })).toBe(false);
  });
});

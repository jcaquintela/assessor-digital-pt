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

describe("destaque do 'Por categorizar'", () => {
  it("categoria manual e automática com o mesmo nome ficam separadas e distinguíveis", () => {
    const files = [
      { id: "m1", custom_category_id: "c1", system_category: null },
      { id: "m2", custom_category_id: "c1", system_category: null },
      { id: "a1", custom_category_id: null, system_category: "documentos" },
    ];
    const cards = buildCategoryCards(
      groupDriveFiles(files, {}, [{ id: "c1", name: "Documentos" }], "categoria"),
    );
    const docs = cards.filter((c) => c.label === "Documentos");
    expect(docs).toHaveLength(2);
    const manual = docs.find((c) => c.key === "cat:c1")!;
    const auto = docs.find((c) => c.key === "sys:documentos")!;
    expect(manual.count).toBe(2);
    expect(manual.hint).toBeUndefined();
    expect(auto.count).toBe(1);
    expect(auto.hint).toBe("automática");
  });

  it("chega ao cartão para a UI o poder realçar", () => {
    const g = groupDriveFiles(
      [{ id: "x", custom_category_id: null, system_category: null }, ...mk(2, "notas")],
      {},
      [],
      "categoria",
    );
    const cards = buildCategoryCards(g);
    expect(cards.find((c) => c.label === "Por categorizar")!.destaque).toBe(true);
    expect(cards.find((c) => c.label !== "Por categorizar")!.destaque).toBeFalsy();
  });
});

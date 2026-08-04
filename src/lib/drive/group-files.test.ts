import { describe, it, expect } from "vitest";
import { groupDriveFiles } from "./group-files";

const cats = [
  { id: "c1", name: "Angariação própria" },
  { id: "c2", name: "Em estudo" },
];

const files = [
  { id: "f1", custom_category_id: "c1" },
  { id: "f2", custom_category_id: null },
  { id: "f3", custom_category_id: "c2" },
  { id: "f4", custom_category_id: "apagada" },
  { id: "f5", custom_category_id: "c1" },
];

const links = {
  f1: [{ entity_type: "opportunity", entity_id: "n2", entity_name: "Zeta" }],
  f3: [{ entity_type: "opportunity", entity_id: "n1", entity_name: "Alfa" }],
  f5: [
    { entity_type: "opportunity", entity_id: "n1", entity_name: "Alfa" },
    { entity_type: "person", entity_id: "p1", entity_name: "Ana" },
  ],
};

describe("groupDriveFiles", () => {
  it("lista devolve tudo num grupo, na ordem original", () => {
    const g = groupDriveFiles(files, links, cats, "lista");
    expect(g).toHaveLength(1);
    expect(g[0].files.map((f) => f.id)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
  });

  it("por categoria: sem categoria em destaque no topo e contagens certas", () => {
    const g = groupDriveFiles(files, links, cats, "categoria");
    expect(g[0].key).toBe("cat:none");
    expect(g[0].destaque).toBe(true);
    expect(g[0].files.map((f) => f.id)).toEqual(["f2", "f4"]);
    expect(g.map((x) => x.label)).toEqual(["Por categorizar", "Angariação própria", "Em estudo"]);
    expect(g.map((x) => x.files.length)).toEqual([2, 2, 1]);
    expect(g.reduce((n, x) => n + x.files.length, 0)).toBe(files.length);
  });

  it("por negócio: ordem alfabética e órfãos destacados no fim", () => {
    const g = groupDriveFiles(files, links, cats, "negocio");
    expect(g.map((x) => x.label)).toEqual(["Alfa", "Zeta", "Sem negócio associado"]);
    expect(g[0].files.map((f) => f.id)).toEqual(["f3", "f5"]);
    expect(g[1].files.map((f) => f.id)).toEqual(["f1"]);
    expect(g[2].destaque).toBe(true);
    expect(g[2].files.map((f) => f.id)).toEqual(["f2", "f4"]);
  });

  it("sem ficheiros devolve zero grupos nos agrupamentos", () => {
    expect(groupDriveFiles([], {}, cats, "categoria")).toEqual([]);
    expect(groupDriveFiles([], {}, cats, "negocio")).toEqual([]);
  });
});

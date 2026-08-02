import { describe, it, expect } from "vitest";
import { detectPerson } from "@/lib/people/detect";
describe("nome sem verbo", () => {
  it("Ana Silva", () => {
    const d = detectPerson("Ana Silva, 912 333 444, proprietária de Moradia em Canelas. Talvez venda em 6 a 12 meses.");
    expect(d.name).toBe("Ana Silva");
    expect(d.roles).toContain("owner");
  });
  it("Pedro Alves", () => {
    const d = detectPerson("Pedro Alves, 913 555 666, comprador interessado");
    expect(d.name).toBe("Pedro Alves");
  });
  it("mantém intro", () => {
    expect(detectPerson("Regista a Maria Costa, 911111111").name).toBe("Maria Costa");
  });
  it("não inventa nome", () => {
    expect(detectPerson("912 333 444 comprador").name).toBeNull();
  });
});

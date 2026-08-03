import { describe, expect, it } from "vitest";
import { isNavActive } from "./app-shell";

describe("destaque da navegação", () => {
  const rotas = ["/negocios", "/negocios/abc-123", "/negocio", "/negocio/comissoes/xyz"];
  it("nunca destaca Negócios e Faturação ao mesmo tempo", () => {
    for (const r of rotas) {
      expect(isNavActive(r, "/negocios") && isNavActive(r, "/negocio")).toBe(false);
    }
  });
  it("destaca a entrada certa em cada rota", () => {
    expect(isNavActive("/negocios", "/negocios")).toBe(true);
    expect(isNavActive("/negocios", "/negocio")).toBe(false);
    expect(isNavActive("/negocios/abc-123", "/negocios")).toBe(true);
    expect(isNavActive("/negocios/abc-123", "/negocio")).toBe(false);
    expect(isNavActive("/negocio", "/negocio")).toBe(true);
    expect(isNavActive("/negocio", "/negocios")).toBe(false);
    expect(isNavActive("/negocio/comissoes/xyz", "/negocio")).toBe(true);
    expect(isNavActive("/negocio/comissoes/xyz", "/negocios")).toBe(false);
  });
});

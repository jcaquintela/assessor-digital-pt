import { describe, expect, it } from "vitest";
import {
  NAV_DESKTOP_V1,
  NAV_MAIS_PAGE,
  NAV_MOBILE,
  NAV_MORE_ENTRY,
  NAV_MORE_V2,
  NAV_PRIMARY_V2,
  visibleNav,
} from "./nav-items";

const rotas = (items: { to: string }[]) => items.map((i) => i.to);

describe("consolidação da barra lateral (v2)", () => {
  it("a barra principal tem exactamente as 5 áreas de uso diário", () => {
    expect(rotas(NAV_PRIMARY_V2)).toEqual([
      "/hoje",
      "/pessoas",
      "/imoveis",
      "/negocios",
      "/calendario",
    ]);
  });

  it("nenhuma área do v1 desaparece: ou fica na barra, ou está em Mais", () => {
    const cobertas = new Set([...rotas(NAV_PRIMARY_V2), ...rotas(NAV_MORE_V2)]);
    for (const r of rotas(NAV_DESKTOP_V1)) expect(cobertas.has(r)).toBe(true);
  });

  it("tudo o que está em Mais na barra existe na página /mais", () => {
    const naPagina = new Set(rotas(NAV_MAIS_PAGE));
    for (const r of rotas(NAV_MORE_V2)) expect(naPagina.has(r)).toBe(true);
  });
});

describe("gating por plano dentro de 'Mais'", () => {
  it("plano base não vê Imóveis nem Faturação em lado nenhum", () => {
    for (const lista of [NAV_PRIMARY_V2, NAV_MORE_V2, NAV_MAIS_PAGE, NAV_DESKTOP_V1]) {
      const visiveis = rotas(visibleNav(lista, "base"));
      expect(visiveis).not.toContain("/imoveis");
      expect(visiveis).not.toContain("/negocio");
    }
  });

  it("plano consultor vê Imóveis mas ainda não Faturação", () => {
    const visiveis = rotas(visibleNav(NAV_MAIS_PAGE, "consultor"));
    expect(visiveis).not.toContain("/negocio");
    expect(rotas(visibleNav(NAV_PRIMARY_V2, "consultor"))).toContain("/imoveis");
  });

  it("plano pro vê tudo", () => {
    expect(rotas(visibleNav(NAV_MAIS_PAGE, "pro"))).toEqual(rotas(NAV_MAIS_PAGE));
  });

  it("Prospeção fica visível em base (upsell deliberado, não é fuga do gate)", () => {
    expect(rotas(visibleNav(NAV_MORE_V2, "base"))).toContain("/oportunidades/prospecao");
  });

  it("a entrada 'Mais' nunca é filtrada por plano", () => {
    expect(visibleNav([NAV_MORE_ENTRY], "base")).toHaveLength(1);
  });
});

describe("acesso à Agenda nunca desaparece", () => {
  const listas: Record<string, { to: string }[]> = {
    "sidebar v1": NAV_DESKTOP_V1,
    "sidebar v2": NAV_PRIMARY_V2,
    "barra mobile": NAV_MOBILE,
    "página /mais": NAV_MAIS_PAGE,
  };
  for (const [nome, lista] of Object.entries(listas)) {
    it(`${nome} inclui /calendario em base, consultor e pro`, () => {
      for (const tier of ["base", "consultor", "pro"]) {
        expect(rotas(visibleNav(lista, tier)), `${nome} / ${tier}`).toContain("/calendario");
      }
    });
  }
  it("Negócios também continua acessível no mobile (via /mais)", () => {
    expect(rotas(visibleNav(NAV_MAIS_PAGE, "base"))).toContain("/negocios");
  });
});

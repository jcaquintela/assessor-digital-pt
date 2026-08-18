import { describe, it, expect } from "vitest";
import {
  resolveCategoryView,
  nextSearchForCard,
  closedSearch,
  categoryShareUrl,
  legacySearch,
  type DriveSearch,
} from "./category-url";

/** Histórico mínimo do browser para exercitar back/forward de forma determinística. */
function historico(inicial: DriveSearch) {
  const stack: DriveSearch[] = [inicial];
  let i = 0;
  return {
    push: (s: DriveSearch) => {
      stack.splice(i + 1);
      stack.push(s);
      i = stack.length - 1;
    },
    back: () => { i = Math.max(0, i - 1); },
    forward: () => { i = Math.min(stack.length - 1, i + 1); },
    get atual() { return stack[i]; },
  };
}

describe("estado das categorias no URL", () => {
  // Categorias pequenas expandem inline; as grandes vão para vista dedicada.
  const inline = (k: string) => k !== "sys:documentos" && k !== "cat:9";

  it("cartões por omissão", () => {
    expect(resolveCategoryView({}, inline)).toEqual({ mode: "cartoes", key: null });
  });

  it("?grp= grande abre a vista dedicada", () => {
    expect(resolveCategoryView({ grp: "sys:documentos" }, inline)).toEqual({
      mode: "dedicada",
      key: "sys:documentos",
    });
  });

  it("?grp= pequeno mantém a grelha com o cartão expandido", () => {
    expect(resolveCategoryView({ grp: "cat:1" }, inline)).toEqual({ mode: "expandido", key: "cat:1" });
  });

  it("links antigos ?cat= e ?exp= passam a ?grp=", () => {
    expect(legacySearch({ cat: "sys:documentos", tab: "recentes" })).toEqual({
      tab: "recentes",
      grp: "sys:documentos",
      cat: undefined,
      exp: undefined,
    });
    expect(legacySearch({ exp: "cat:1" })?.grp).toBe("cat:1");
    expect(legacySearch({ grp: "cat:1" })).toBeNull();
    expect(legacySearch({})).toBeNull();
    // Enquanto não redirecciona, o ecrã continua a resolver na mesma.
    expect(resolveCategoryView({ cat: "cat:1" }, inline).key).toBe("cat:1");
  });

  it("pesquisa anula a categoria aberta (resultados transversais)", () => {
    expect(resolveCategoryView({ grp: "cat:1", q: "ana" }, inline).mode).toBe("pesquisa");
    expect(resolveCategoryView({ grp: "cat:1", nif: "123" }, inline).mode).toBe("pesquisa");
    expect(resolveCategoryView({ grp: "cat:1", q: "  " }, inline).mode).toBe("expandido");
  });

  it("clicar num cartão faz toggle; clicar noutro troca", () => {
    const a = nextSearchForCard({}, "cat:1");
    expect(a.grp).toBe("cat:1");
    expect(nextSearchForCard(a, "cat:1").grp).toBeUndefined();
    expect(nextSearchForCard(a, "cat:2").grp).toBe("cat:2");
  });

  it("preserva os restantes parâmetros (tab, filtros)", () => {
    expect(nextSearchForCard({ tab: "por_tratar" }, "cat:1").tab).toBe("por_tratar");
    expect(closedSearch({ tab: "recentes", grp: "cat:1" })).toEqual({
      tab: "recentes",
      grp: undefined,
      cat: undefined,
      exp: undefined,
    });
  });

  it("back e forward repõem exactamente o mesmo ecrã", () => {
    const h = historico({ tab: "recentes" });
    h.push(nextSearchForCard(h.atual, "cat:1"));
    h.push(nextSearchForCard(h.atual, "sys:documentos"));
    expect(resolveCategoryView(h.atual, inline)).toEqual({ mode: "dedicada", key: "sys:documentos" });

    h.back();
    expect(resolveCategoryView(h.atual, inline)).toEqual({ mode: "expandido", key: "cat:1" });
    h.back();
    expect(resolveCategoryView(h.atual, inline)).toEqual({ mode: "cartoes", key: null });

    h.forward();
    expect(resolveCategoryView(h.atual, inline)).toEqual({ mode: "expandido", key: "cat:1" });
    h.forward();
    expect(resolveCategoryView(h.atual, inline)).toEqual({ mode: "dedicada", key: "sys:documentos" });
    expect(h.atual.tab).toBe("recentes");
  });

  it("fechar volta aos cartões e o forward ainda reabre a categoria", () => {
    const h = historico({});
    h.push(nextSearchForCard(h.atual, "cat:9"));
    h.push(closedSearch(h.atual));
    expect(resolveCategoryView(h.atual, inline).mode).toBe("cartoes");
    h.back();
    expect(resolveCategoryView(h.atual, inline)).toEqual({ mode: "dedicada", key: "cat:9" });
  });

  it("link partilhável reabre a mesma vista", () => {
    const url = categoryShareUrl("https://app.pt", "/drive", { tab: "por_tratar", q: "ana" }, "cat:1");
    expect(url).toBe("https://app.pt/drive?tab=por_tratar&grp=cat%3A1");
    const s = Object.fromEntries(new URL(url).searchParams) as DriveSearch;
    expect(resolveCategoryView(s, inline)).toEqual({ mode: "expandido", key: "cat:1" });
    const dedicada = categoryShareUrl("https://app.pt", "/drive", {}, "sys:documentos");
    expect(resolveCategoryView(Object.fromEntries(new URL(dedicada).searchParams), inline)).toEqual({
      mode: "dedicada",
      key: "sys:documentos",
    });
  });
});

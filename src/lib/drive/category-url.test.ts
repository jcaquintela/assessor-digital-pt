import { describe, it, expect } from "vitest";
import {
  resolveCategoryView,
  nextSearchForCard,
  closedSearch,
  categoryShareUrl,
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
  it("cartões por omissão", () => {
    expect(resolveCategoryView({})).toEqual({ mode: "cartoes", key: null });
  });

  it("?cat= abre a vista dedicada", () => {
    expect(resolveCategoryView({ cat: "sys:documentos" })).toEqual({
      mode: "dedicada",
      key: "sys:documentos",
    });
  });

  it("?exp= mantém a grelha com o cartão expandido", () => {
    expect(resolveCategoryView({ exp: "cat:1" })).toEqual({ mode: "expandido", key: "cat:1" });
  });

  it("pesquisa anula a categoria aberta (resultados transversais)", () => {
    expect(resolveCategoryView({ cat: "cat:1", q: "ana" }).mode).toBe("pesquisa");
    expect(resolveCategoryView({ exp: "cat:1", nif: "123" }).mode).toBe("pesquisa");
    expect(resolveCategoryView({ exp: "cat:1", q: "  " }).mode).toBe("expandido");
  });

  it("clicar num cartão inline faz toggle; clicar noutro troca", () => {
    const a = nextSearchForCard({}, "cat:1", true);
    expect(a.exp).toBe("cat:1");
    expect(nextSearchForCard(a, "cat:1", true).exp).toBeUndefined();
    expect(nextSearchForCard(a, "cat:2", true).exp).toBe("cat:2");
  });

  it("cartão grande vai para vista dedicada e limpa o expandido", () => {
    const s = nextSearchForCard({ exp: "cat:1" }, "sys:documentos", false);
    expect(s).toMatchObject({ cat: "sys:documentos", exp: undefined });
  });

  it("preserva os restantes parâmetros (tab, filtros)", () => {
    expect(nextSearchForCard({ tab: "por_tratar" }, "cat:1", true).tab).toBe("por_tratar");
    expect(closedSearch({ tab: "recentes", cat: "cat:1", exp: "cat:2" })).toEqual({
      tab: "recentes",
      cat: undefined,
      exp: undefined,
    });
  });

  it("back e forward repõem exactamente o mesmo ecrã", () => {
    const h = historico({ tab: "recentes" });
    h.push(nextSearchForCard(h.atual, "cat:1", true));   // expande inline
    h.push(nextSearchForCard(h.atual, "sys:documentos", false)); // abre dedicada
    expect(resolveCategoryView(h.atual)).toEqual({ mode: "dedicada", key: "sys:documentos" });

    h.back();
    expect(resolveCategoryView(h.atual)).toEqual({ mode: "expandido", key: "cat:1" });
    h.back();
    expect(resolveCategoryView(h.atual)).toEqual({ mode: "cartoes", key: null });

    h.forward();
    expect(resolveCategoryView(h.atual)).toEqual({ mode: "expandido", key: "cat:1" });
    h.forward();
    expect(resolveCategoryView(h.atual)).toEqual({ mode: "dedicada", key: "sys:documentos" });
    expect(h.atual.tab).toBe("recentes");
  });

  it("fechar volta aos cartões e o forward ainda reabre a categoria", () => {
    const h = historico({});
    h.push(nextSearchForCard(h.atual, "cat:9", false));
    h.push(closedSearch(h.atual));
    expect(resolveCategoryView(h.atual).mode).toBe("cartoes");
    h.back();
    expect(resolveCategoryView(h.atual)).toEqual({ mode: "dedicada", key: "cat:9" });
  });

  it("link partilhável reabre a mesma vista", () => {
    const url = categoryShareUrl("https://app.pt", "/drive", { tab: "por_tratar", q: "ana" }, "cat:1", true);
    expect(url).toBe("https://app.pt/drive?tab=por_tratar&exp=cat%3A1");
    const s = Object.fromEntries(new URL(url).searchParams) as DriveSearch;
    expect(resolveCategoryView(s)).toEqual({ mode: "expandido", key: "cat:1" });
    const dedicada = categoryShareUrl("https://app.pt", "/drive", {}, "sys:documentos", false);
    expect(resolveCategoryView(Object.fromEntries(new URL(dedicada).searchParams))).toEqual({
      mode: "dedicada",
      key: "sys:documentos",
    });
  });
});

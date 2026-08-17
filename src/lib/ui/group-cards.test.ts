import { describe, it, expect } from "vitest";
import {
  INLINE_LIMIT, buildGroupCards, closedGroupSearch, groupShareUrl,
  nextSearchForGroup, resolveCardsView,
} from "./group-cards";

const mk = (n: number, p: string) => Array.from({ length: n }, (_, i) => ({ id: `${p}-${i}` }));

describe("cartões de grupo (padrão Drive generalizado)", () => {
  const cards = buildGroupCards([
    { key: "por_angariar", label: "Por angariar", items: mk(3, "a") },
    { key: "ativo", label: "Ativo", items: mk(20, "b") },
    { key: "vendido", label: "Vendido", items: [] },
  ]);

  it("grupo pequeno expande inline", () => {
    expect(cards.find((c) => c.key === "por_angariar")!.inline).toBe(true);
  });

  it("grupo grande vai para vista dedicada", () => {
    const c = cards.find((c) => c.key === "ativo")!;
    expect(c.inline).toBe(false);
    expect(c.count).toBe(20);
  });

  it("grupo vazio continua a gerar cartão, a zero", () => {
    expect(cards.map((c) => c.key)).toEqual(["por_angariar", "ativo", "vendido"]);
    expect(cards.find((c) => c.key === "vendido")).toMatchObject({ count: 0, inline: true });
  });

  it("esconder vazios é opt-in explícito", () => {
    const so = buildGroupCards(
      [{ key: "a", label: "A", items: mk(1, "a") }, { key: "b", label: "B", items: [] }],
      INLINE_LIMIT,
      false,
    );
    expect(so.map((c) => c.key)).toEqual(["a"]);
  });

  it("limite é inclusive", () => {
    expect(buildGroupCards([{ key: "k", label: "K", items: mk(INLINE_LIMIT, "x") }])[0].inline).toBe(true);
    expect(buildGroupCards([{ key: "k", label: "K", items: mk(INLINE_LIMIT + 1, "x") }])[0].inline).toBe(false);
  });

  it("contagem bate certo com o total real", () => {
    expect(cards.reduce((n, c) => n + c.count, 0)).toBe(23);
  });
});

describe("estado no URL", () => {
  it("sem nada aberto mostra cartões", () => {
    expect(resolveCardsView({})).toEqual({ mode: "cartoes", key: null });
  });

  it("pesquisa desliga os cartões", () => {
    expect(resolveCardsView({ q: "porto", grp: "ativo" }).mode).toBe("pesquisa");
    expect(resolveCardsView({ q: "   " }).mode).toBe("cartoes");
  });

  it("grupo aberto é lido do URL", () => {
    expect(resolveCardsView({ grp: "ativo" })).toEqual({ mode: "aberto", key: "ativo" });
  });

  it("clicar no mesmo cartão fecha, clicar noutro troca", () => {
    expect(nextSearchForGroup({ grp: "ativo" }, "ativo").grp).toBeUndefined();
    expect(nextSearchForGroup({ grp: "ativo" }, "vendido").grp).toBe("vendido");
    expect(closedGroupSearch({ q: "x", grp: "ativo" })).toEqual({ q: "x", grp: undefined });
  });

  it("link partilhável reabre a mesma vista", () => {
    const url = groupShareUrl("https://a.pt", "/imoveis", "por_angariar");
    expect(url).toBe("https://a.pt/imoveis?grp=por_angariar");
    expect(resolveCardsView({ grp: new URL(url).searchParams.get("grp")! }).key).toBe("por_angariar");
  });
});
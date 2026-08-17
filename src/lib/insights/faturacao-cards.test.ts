import { describe, it, expect } from "vitest";
import { faturacaoCards, ESTADOS_COMISSAO, CATEGORIAS_DESPESA, FATURA_GRUPOS } from "./faturacao-cards";

describe("cartões de Faturação com carteira quase vazia", () => {
  const comissoes = [{ estado: "Prevista" }];
  const despesas: { categoria: string }[] = [];

  it("um único movimento: as três abas mostram cartões", () => {
    const c = faturacaoCards("comissoes", comissoes, despesas);
    const d = faturacaoCards("despesas", comissoes, despesas);
    const f = faturacaoCards("faturas", comissoes, despesas);
    expect(c.map((x) => x.key)).toEqual(ESTADOS_COMISSAO);
    expect(d.map((x) => x.key)).toEqual([...CATEGORIAS_DESPESA]);
    expect(f.map((x) => x.key)).toEqual(FATURA_GRUPOS.map((g) => g.key));
    expect(c.find((x) => x.key === "Prevista")!.count).toBe(1);
    expect(f.find((x) => x.key === "por_faturar")!.count).toBe(1);
    expect(d.every((x) => x.count === 0)).toBe(true);
  });

  it("uma despesa única não esconde as outras categorias", () => {
    const d = faturacaoCards("despesas", [], [{ categoria: "Marketing" }]);
    expect(d).toHaveLength(CATEGORIAS_DESPESA.length);
    expect(d.find((x) => x.key === "Marketing")!.count).toBe(1);
  });
});

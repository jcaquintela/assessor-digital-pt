import { describe, expect, it } from "vitest";
import { miscReason } from "./misc-reason";

describe("miscReason", () => {
  it("identifica proposta por confirmar", () => {
    expect(miscReason({ title: "Proposta não confirmada: Casa A" }).key).toBe("por_confirmar");
  });
  it("identifica falha de compreensão", () => {
    expect(miscReason({ title: "x", tags: ["falha_assessor"] }).key).toBe("nao_percebi");
  });
  it("identifica serviço indisponível", () => {
    expect(miscReason({ title: "x", summary: "Ficou por tratar: serviço indisponível" }).key).toBe("servico_em_baixo");
  });
  it("usa o resumo escrito quando existe", () => {
    expect(miscReason({ title: "x", summary: "Ficou por tratar: not_understood" }).detail)
      .toContain("Ficou por tratar");
  });
  it("nota simples tem sempre motivo legível", () => {
    const r = miscReason({ title: "Ideia de marketing" });
    expect(r.label).toBe("Nota guardada");
    expect(r.detail.length).toBeGreaterThan(5);
  });
});

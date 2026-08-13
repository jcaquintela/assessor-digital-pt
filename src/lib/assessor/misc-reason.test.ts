import { describe, expect, it } from "vitest";
import { classifyTechnicalReason, humanReason, miscReason } from "./misc-reason";

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
  it("nunca mostra texto técnico do motor", () => {
    const r = miscReason({ title: "x", summary: "search_people:invalid_args", tags: ["falha_assessor"] });
    expect(r.detail).not.toContain("invalid_args");
    expect(r.detail).toBe(humanReason(r.key));
  });
  it("nota simples tem sempre motivo legível", () => {
    const r = miscReason({ title: "Ideia de marketing" });
    expect(r.label).toBe("Nota guardada");
    expect(r.detail.length).toBeGreaterThan(5);
  });
});

describe("classifyTechnicalReason", () => {
  it("act sem ferramenta → sem capacidade", () => {
    expect(classifyTechnicalReason("act sem ferramenta")).toBe("sem_capacidade");
    expect(classifyTechnicalReason("no_tool")).toBe("sem_capacidade");
    expect(humanReason("sem_capacidade")).toContain("falta-me essa capacidade");
  });
  it("reminder_not_found e invalid_args → falhou execução", () => {
    expect(classifyTechnicalReason("reschedule_reminder:reminder_not_found")).toBe("falhou_execucao");
    expect(classifyTechnicalReason("search_people:invalid_args:Invalid input")).toBe("falhou_execucao");
  });
  it("indisponibilidade → serviço em baixo", () => {
    expect(classifyTechnicalReason("timeout")).toBe("servico_em_baixo");
  });
});

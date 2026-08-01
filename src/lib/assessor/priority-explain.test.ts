import { describe, expect, it } from "vitest";
import { explainPriority, priorityLevel } from "./priority-explain";

describe("explainPriority", () => {
  it("traduz atraso e telefone em linguagem normal", () => {
    expect(
      explainPriority({ priority_score: 85, reasons: ["atrasado há 5 dias", "com telefone disponível"] }),
    ).toBe("Prioridade elevada: está atrasado há 5 dias e há um número de telefone disponível.");
  });

  it("usa nível médio e negócio sem próxima ação", () => {
    expect(explainPriority({ priority_score: 60, reasons: ["oportunidade sem próxima ação"] }))
      .toBe("Prioridade média: o negócio está sem próxima ação definida.");
  });

  it("aguenta ausência de motivos", () => {
    expect(explainPriority({ priority_score: 40, reasons: [] })).toBe("Prioridade normal.");
  });

  it("níveis", () => {
    expect(priorityLevel(90)).toBe("elevada");
    expect(priorityLevel(65)).toBe("média");
    expect(priorityLevel(30)).toBe("normal");
  });
});

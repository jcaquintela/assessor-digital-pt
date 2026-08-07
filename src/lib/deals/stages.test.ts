import { describe, expect, it } from "vitest";
import { isDealActive, isDealClosed } from "./stages";

describe("estado operacional único dos negócios", () => {
  it("exclui um negócio concluído mesmo sem pessoa e sem próxima ação", () => {
    const vendaDoTerreno = {
      stage: "concluido",
      status: "Concluída",
      archived_at: null,
      person_id: null,
      next_action: null,
    };

    expect(isDealClosed(vendaDoTerreno)).toBe(true);
    expect(isDealActive(vendaDoTerreno)).toBe(false);
  });

  it("exclui arquivados e mantém negócios realmente em curso", () => {
    expect(isDealActive({ stage: "proposta", status: "Em curso", archived_at: "2026-08-07T12:00:00Z" })).toBe(false);
    expect(isDealActive({ stage: "proposta", status: "Em curso", archived_at: null })).toBe(true);
  });

  it("mantém compatibilidade com linhas antigas sem fase", () => {
    expect(isDealActive({ stage: null, status: "Concluída" })).toBe(false);
    expect(isDealActive({ stage: null, status: "Em conversa" })).toBe(true);
  });
});
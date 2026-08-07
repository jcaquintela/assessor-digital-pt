import { describe, expect, it } from "vitest";
import { hasCommercialOutcomeContext } from "./outcome-eligibility";

describe("contexto comercial do check-in", () => {
  it("golden: Almoço sem Pessoa, Negócio ou Imóvel nunca gera check-in", () => {
    expect(hasCommercialOutcomeContext({
      person_id: null,
      opportunity_id: null,
      related_property_id: null,
    })).toBe(false);
  });

  it.each([
    { person_id: "p1" },
    { opportunity_id: "n1" },
    { related_property_id: "i1" },
  ])("aceita contexto comercial explícito: %o", (item) => {
    expect(hasCommercialOutcomeContext(item)).toBe(true);
  });
});
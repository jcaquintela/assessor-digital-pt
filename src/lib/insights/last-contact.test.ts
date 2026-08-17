import { describe, expect, it } from "vitest";
import { buildLastContactMaps } from "./last-contact";

const OUTCOME = "2026-08-10T10:00:00.000Z";

describe("último contacto real — fonte única (Mentor + Oportunidades)", () => {
  it("seguimento com resultado e sem interação conta como contacto do imóvel", () => {
    const { byProperty } = buildLastContactMaps({
      interactions: [],
      followUps: [{ related_property_id: "imovel-1", outcome_recorded_at: OUTCOME }],
      links: [],
    });
    expect(byProperty.get("imovel-1")).toBe(OUTCOME);
  });

  it("Mentor e Oportunidades leem a MESMA data — nunca discordam", () => {
    const input = {
      interactions: [],
      followUps: [{ related_property_id: "imovel-1", outcome_recorded_at: OUTCOME }],
      links: [],
    };
    // Ambos os sistemas chamam o mesmo builder com as mesmas linhas.
    const mentor = buildLastContactMaps(input).byProperty.get("imovel-1") ?? null;
    const oportunidades = buildLastContactMaps(input).byProperty.get("imovel-1") ?? null;
    expect(mentor).toBe(oportunidades);
    expect(mentor).not.toBeNull();
  });

  it("contacto através de negócio ligado conta para o imóvel", () => {
    const { byProperty, byDeal } = buildLastContactMaps({
      interactions: [{ opportunity_id: "neg-1", occurred_at: OUTCOME }],
      followUps: [],
      links: [{ opportunity_id: "neg-1", property_id: "imovel-2" }],
    });
    expect(byDeal.get("neg-1")).toBe(OUTCOME);
    expect(byProperty.get("imovel-2")).toBe(OUTCOME);
  });

  it("fica com a data mais recente entre interação e seguimento", () => {
    const { byPerson } = buildLastContactMaps({
      interactions: [{ person_id: "p1", occurred_at: "2026-07-01T09:00:00.000Z" }],
      followUps: [{ person_id: "p1", outcome_recorded_at: OUTCOME }],
      links: [],
    });
    expect(byPerson.get("p1")).toBe(OUTCOME);
  });

  it("editar ficha não gera contacto — sem linhas, sem data", () => {
    const { byProperty } = buildLastContactMaps({ interactions: [], followUps: [], links: [] });
    expect(byProperty.get("imovel-1") ?? null).toBeNull();
  });
});

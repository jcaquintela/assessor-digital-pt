import { describe, expect, it } from "vitest";
import { propertySummary } from "./summary";
import { propertyOpenQuestions } from "./questions";

describe("resumo O que sabemos", () => {
  it("usa só dados reais e não inventa", () => {
    const f = propertySummary({
      property: { address: "Alameda da República 12", city: "Aveiro", typology: "T3", asking_price: 250000 },
      owner: { name: "Rui Neves" },
      deal: { stage: "proposta" },
      currentOffer: 200000,
      visitsDone: 2,
      interestsOpen: 1,
    });
    expect(f.join(" ")).toContain("T3 em Alameda da República 12, Aveiro");
    expect(f.join(" ")).toContain("Rui Neves");
    expect(f.join(" ")).toMatch(/-20%/);
    expect(f.join(" ")).not.toMatch(/provavelmente|deve ser/i);
  });

  it("ficha vazia devolve frase neutra", () => {
    expect(propertySummary({ property: {} })[0]).toMatch(/Ainda sabemos pouco/);
  });
});

describe("informação por confirmar", () => {
  const now = Date.parse("2026-08-02T12:00:00Z");
  it("pergunta por proposta pendente antiga e respeita ignorados", () => {
    const base = {
      property: { owner_person_id: "x" },
      owner: { name: "Rui" },
      offers: [{ id: "o1", amount: 200000, from: "Ana", status: "pendente", date: "2026-07-20T10:00:00Z" }],
      now,
    };
    const qs = propertyOpenQuestions(base);
    expect(qs.map((q) => q.key)).toContain("offer:o1");
    expect(propertyOpenQuestions({ ...base, dismissedKeys: ["offer:o1"] })).toHaveLength(0);
  });

  it("não pergunta por proposta de ontem", () => {
    const qs = propertyOpenQuestions({
      property: { owner_person_id: "x" }, owner: { name: "Rui" },
      offers: [{ id: "o2", amount: 1000, status: "pendente", date: "2026-08-01T10:00:00Z" }], now,
    });
    expect(qs).toHaveLength(0);
  });

  it("deteta visita passada sem resultado e venda sem valor", () => {
    const qs = propertyOpenQuestions({
      property: { owner_person_id: "x", sold_at: "2026-07-30T10:00:00Z", sale_price: null },
      owner: { name: "Rui" },
      visits: [{ id: "v1", who: "Ana", dueAt: "2026-07-28T10:00:00Z", state: "agendada" }],
      now,
    });
    expect(qs.map((q) => q.kind)).toEqual(["visit_no_outcome", "sold_without_price"]);
  });
});

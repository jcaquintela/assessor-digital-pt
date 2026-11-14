// (4) Plano base: no máximo 1 oportunidade de match comprador↔imóvel por dia,
// só com os três critérios a coincidir (sem falsos positivos). Pro inalterado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/assessor/cross-channel/test-fake-db";
import { __resetAccountFlagsForTests, __setAccountFlagForTests } from "@/lib/flags/account-flag.server";

vi.mock("@/lib/insights/last-contact.server", () => ({
  computeLastContact: async () => ({ maps: { byProperty: new Map(), byDeal: new Map(), byPerson: new Map() } }),
}));

import { strictMatchAlerts, type LeadInput, type PropertyMatchInput } from "@/lib/opportunities/detector";
import { BASE_MATCH_FLAG, computeOpportunityAlerts } from "@/lib/opportunities/detector.server";
import { generateOpportunityNudges } from "@/lib/opportunities/digest.server";

const U = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-16T10:00:00Z");
const lead = (o: Partial<LeadInput> = {}): LeadInput => ({
  id: "l1", name: "Ana", searchLocation: "Matosinhos", searchTypology: "T2", budgetMin: 200000, budgetMax: 260000, ...o,
});
const prop = (o: Partial<PropertyMatchInput> = {}): PropertyMatchInput => ({
  id: "p1", title: "T2 Matosinhos Sul", typology: "T2", location: "Matosinhos", price: 245000, ...o,
});

describe("match estrito (puro)", () => {
  it("zona, tipologia e preço coincidem → 1 oportunidade com evidência dos três critérios", () => {
    const [a] = strictMatchAlerts([lead()], [prop()]);
    expect(a.meta).toMatchObject({
      strict: true,
      criteria: {
        zone: { lead: "Matosinhos", property: "Matosinhos" },
        typology: { lead: "T2", property: "T2" },
        budget: { min: 200000, max: 260000, price: 245000 },
      },
    });
    expect(a.detail).toContain("245");
  });
  it.each([
    ["tipologia vizinha", lead(), prop({ typology: "T3" })],
    ["zona só com uma palavra em comum", lead({ searchLocation: "Senhora da Hora" }), prop({ location: "Hora Velha" })],
    ["preço 5% acima do orçamento", lead(), prop({ price: 273000 })],
    ["comprador sem teto de orçamento", lead({ budgetMax: null }), prop()],
    ["imóvel sem preço", lead(), prop({ price: null })],
    ["comprador sem zona", lead({ searchLocation: null }), prop()],
  ])("%s → nenhuma oportunidade", (_n, l, p) => {
    expect(strictMatchAlerts([l], [p])).toEqual([]);
  });
});

function seed(tier: string) {
  return createFakeDb(
    {
      people: [
        { id: "l1", user_id: U, name: "Ana", roles: ["buyer"], search_location: "Matosinhos", search_property_type: "T2",
          budget_min: 200000, budget_max: 260000, created_at: "2026-11-10T10:00:00Z", updated_at: "2026-11-10T10:00:00Z" },
        { id: "l2", user_id: U, name: "Bruno", roles: ["buyer"], search_location: "Matosinhos", search_property_type: "T2",
          budget_min: null, budget_max: 300000, created_at: "2026-11-11T10:00:00Z", updated_at: "2026-11-11T10:00:00Z" },
      ],
      properties: [
        { id: "p1", user_id: U, title: "T2 Matosinhos Sul", typology: "T2", status: "ativo", location: "Matosinhos",
          asking_price: 245000, created_at: "2026-11-01T10:00:00Z" },
      ],
      opportunities: [
        { id: "d1", user_id: U, title: "Negócio parado", stage: "proposta", status: "open", created_at: "2026-10-01T10:00:00Z" },
      ],
      alert_mutes: [],
      assessor_nudges: [],
    },
    { rpc: { effective_tier: () => tier } },
  );
}

beforeEach(() => { __resetAccountFlagsForTests(); });

describe("gating por plano", () => {
  it("plano base com interruptor desligado: nada (como antes)", async () => {
    expect(await computeOpportunityAlerts(seed("base"), U, NOW)).toEqual([]);
  });
  it("plano base ligado: só matches estritos, sem negócios parados", async () => {
    __setAccountFlagForTests(BASE_MATCH_FLAG, U, true);
    const alerts = await computeOpportunityAlerts(seed("base"), U, NOW);
    expect(alerts.length).toBe(2);
    expect(alerts.every((a) => a.engine === "match_lead_imovel" && (a.meta as any).strict)).toBe(true);
  });
  it("plano base ligado: no máximo 1 aviso por dia, mesmo com 2 matches", async () => {
    __setAccountFlagForTests(BASE_MATCH_FLAG, U, true);
    const drafts = await generateOpportunityNudges(seed("base"), U, NOW);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("opportunity_match");
  });
  it("Pro mantém tudo: inclui negócio parado e não fica limitado a 1 candidato", async () => {
    const alerts = await computeOpportunityAlerts(seed("pro"), U, NOW);
    expect(alerts.some((a) => a.engine === "negocio_arrefecer")).toBe(true);
    expect(alerts.some((a) => (a.meta as any)?.strict)).toBe(false);
  });
});

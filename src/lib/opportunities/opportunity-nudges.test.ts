// Oportunidades comerciais → aviso no canal: só match e negócio parado,
// com evidência, prioridade e sem repetir o que saiu na última semana.
import { describe, expect, it } from "vitest";
import { dealCoolingAlerts, matchAlerts } from "./detector";
import { buildOpportunityNudges, alertKeyFromDedupe, opportunityPriority } from "./opportunity-nudges";
import { claimsDelivery } from "@/lib/assessor/culture/confirmations";

const NOW = new Date("2026-11-17T10:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 864e5).toISOString();

const lead = { id: "l1", name: "Rita", searchLocation: "Matosinhos", searchTypology: "T2", budgetMin: 250000, budgetMax: 320000 };
const prop = { id: "p1", title: "T2 Matosinhos Sul", typology: "T2", location: "Matosinhos", price: 300000 };

describe("avisos de oportunidade", () => {
  it("negócio em proposta parado há 6 dias gera aviso com evidência", () => {
    const alerts = dealCoolingAlerts([{ id: "d1", label: "Venda T3 Foz", stage: "proposta", lastInteractionAt: daysAgo(6) }], NOW);
    const [d] = buildOpportunityNudges(alerts, { ymdCompact: "20261117" });
    expect(d.kind).toBe("deal_stalled");
    expect(d.subject_id).toBe("d1");
    expect(d.dedupe_key).toBe("opportunity:negocio_arrefecer:d1:20261117");
    expect(d.evidence).toMatchObject({ days: 6, stage: "proposta" });
    expect(d.suggested_reply).toContain("6 dias");
  });

  it("em proposta a 4 dias não há aviso", () => {
    const alerts = dealCoolingAlerts([{ id: "d1", label: "Venda", stage: "proposta", lastInteractionAt: daysAgo(4) }], NOW);
    expect(buildOpportunityNudges(alerts, { ymdCompact: "20261117" })).toEqual([]);
  });

  it("match comprador↔imóvel compatível gera aviso com a pontuação como evidência", () => {
    const [d] = buildOpportunityNudges(matchAlerts([lead], [prop]), { ymdCompact: "20261117" });
    expect(d.kind).toBe("opportunity_match");
    expect(d.subject_id).toBe("p1");
    expect(d.evidence).toMatchObject({ score: 100, leadId: "l1", propertyId: "p1" });
    expect(d.suggested_reply).toContain("Rita");
  });

  it("negócio em proposta parado vem antes de um match", () => {
    const alerts = [
      ...matchAlerts([lead], [prop]),
      ...dealCoolingAlerts([{ id: "d1", label: "Venda", stage: "proposta", lastInteractionAt: daysAgo(6) }], NOW),
    ];
    const out = buildOpportunityNudges(alerts, { ymdCompact: "20261117" });
    expect(out[0].kind).toBe("deal_stalled");
    expect(out[0].priority).toBeGreaterThan(out[1].priority);
  });

  it("não repete um alerta já enviado nos últimos dias", () => {
    const alerts = matchAlerts([lead], [prop]);
    const sentKey = alertKeyFromDedupe("opportunity:match_lead_imovel:l1:p1:20261114")!;
    expect(sentKey).toBe("match_lead_imovel:l1:p1");
    expect(buildOpportunityNudges(alerts, { ymdCompact: "20261117", recentlySentAlertKeys: [sentKey] })).toEqual([]);
  });

  it("imóvel parado não entra nesta fase", () => {
    const fake = { key: "imovel_parado:x", engine: "imovel_parado" as const, title: "X", detail: "d", action: "a", urgency: "alta" as const, to: "/" };
    expect(opportunityPriority(fake)).toBe(0);
    expect(buildOpportunityNudges([fake], { ymdCompact: "20261117" })).toEqual([]);
  });

  it("o texto nunca diz que contactou ou enviou algo a terceiros", () => {
    const alerts = [
      ...matchAlerts([lead], [prop]),
      ...dealCoolingAlerts(["proposta", "cpcv", "escritura", "visitas"].map((stage, i) => ({ id: `d${i}`, label: "N", stage, lastInteractionAt: daysAgo(30) })), NOW),
    ];
    for (const d of buildOpportunityNudges(alerts, { ymdCompact: "20261117", max: 10 })) {
      expect(claimsDelivery(d.suggested_reply)).toBe(false);
      expect(d.suggested_reply).not.toMatch(/\b(enviei|mandei|contactei|liguei)\b/i);
    }
  });
});

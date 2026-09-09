import { describe, expect, it } from "vitest";
import {
  applyMutes, composeDigestText, dealCoolingAlerts, dealThresholdDays, matchAlerts,
  matchScore, propertyStalledAlerts, propertyThresholdDays,
} from "./detector";

const NOW = new Date("2026-08-17T12:00:00Z").getTime();
const diasAtras = (n: number) => new Date(NOW - n * 864e5).toISOString();

describe("tempos de referência", () => {
  it("usa 30 dias até T2 e 45 de T3 para cima", () => {
    expect(propertyThresholdDays("T1")).toBe(30);
    expect(propertyThresholdDays("T2")).toBe(30);
    expect(propertyThresholdDays("T3")).toBe(45);
    expect(propertyThresholdDays(null)).toBe(30);
  });
  it("reduz o tempo esperado a partir da proposta", () => {
    expect(dealThresholdDays("visitas")).toBe(10);
    expect(dealThresholdDays("proposta")).toBe(5);
    expect(dealThresholdDays("cpcv")).toBe(5);
  });
});

describe("imóveis parados", () => {
  it("só sinaliza depois do tempo esperado e sugere sempre ação", () => {
    const alerts = propertyStalledAlerts([
      { id: "a", title: "Apartamento Benfica", typology: "T2", lastMovementAt: diasAtras(31) },
      { id: "b", title: "Moradia Sintra", typology: "T4", lastMovementAt: diasAtras(31) },
    ], NOW);
    expect(alerts.map((a) => a.key)).toEqual(["imovel_parado:a"]);
    expect(alerts[0].action.length).toBeGreaterThan(10);
  });

  it("mostra o caso do Terreno sem jargão e mantém os dois tempos", () => {
    const [alert] = propertyStalledAlerts([
      { id: "terreno", title: "Terreno", typology: null, lastMovementAt: diasAtras(36) },
    ], NOW);

    expect(`${alert.title}: ${alert.detail}`).toBe(
      "Terreno: Sem visita nem alteração de estado há 36 dias — já passou o tempo esperado sem movimento (30 dias).",
    );
    expect(`${alert.title} ${alert.detail}`.toLowerCase()).not.toMatch(/régua|regua|limiar/);
  });
});

describe("match lead ↔ imóvel", () => {
  const lead = {
    id: "l1", name: "Ana", searchLocation: "Benfica", searchTypology: "T2",
    budgetMin: 200000, budgetMax: 250000,
  };
  it("dá 100% quando zona, tipologia e orçamento batem", () => {
    expect(matchScore(lead, { id: "p1", title: "X", typology: "T2", location: "Benfica", price: 240000 })).toBe(100);
  });
  it("não alerta com tipologia diferente", () => {
    const alerts = matchAlerts([lead], [
      { id: "p2", title: "Y", typology: "T3", location: "Benfica", price: 240000 },
    ]);
    expect(alerts).toHaveLength(0);
  });
  it("ignora leads sem critérios suficientes", () => {
    const vago = { id: "l2", name: "B", searchLocation: null, searchTypology: null, budgetMin: null, budgetMax: null };
    expect(matchScore(vago, { id: "p1", title: "X", typology: "T2", location: "Benfica", price: 240000 })).toBe(0);
  });
});

describe("negócios a arrefecer", () => {
  it("escala urgência na fase de proposta", () => {
    const alerts = dealCoolingAlerts([
      { id: "d1", label: "Proposta Ana", stage: "proposta", lastInteractionAt: diasAtras(6) },
      { id: "d2", label: "Angariação Rui", stage: "angariacao", lastInteractionAt: diasAtras(6) },
    ], NOW);
    expect(alerts.map((a) => a.key)).toEqual(["negocio_arrefecer:d1"]);
    expect(alerts[0].urgency).toBe("alta");
  });

  it("explica o tempo esperado sem linguagem interna", () => {
    const [alert] = dealCoolingAlerts([
      { id: "d1", label: "Proposta Ana", stage: "proposta", lastInteractionAt: diasAtras(6) },
    ], NOW);
    expect(alert.detail).toContain("já passou o tempo esperado nesta fase (5 dias)");
    expect(alert.detail.toLowerCase()).not.toMatch(/régua|regua|limiar/);
  });
});

describe("silenciar e resumo", () => {
  it("esconde alertas silenciados e volta a mostrar depois", () => {
    const alerts = dealCoolingAlerts(
      [{ id: "d1", label: "X", stage: "proposta", lastInteractionAt: diasAtras(9) }], NOW,
    );
    expect(applyMutes(alerts, [{ alertKey: "negocio_arrefecer:d1", mutedUntil: diasAtras(-3) }], NOW)).toHaveLength(0);
    expect(applyMutes(alerts, [{ alertKey: "negocio_arrefecer:d1", mutedUntil: diasAtras(1) }], NOW)).toHaveLength(1);
  });
  it("resume num texto único ou cala-se", () => {
    expect(composeDigestText([])).toBeNull();
    const texto = composeDigestText(dealCoolingAlerts(
      [{ id: "d1", label: "Proposta Ana", stage: "proposta", lastInteractionAt: diasAtras(9) }], NOW,
    ));
    expect(texto).toContain("Proposta Ana");
  });
});
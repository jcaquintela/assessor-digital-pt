import { describe, expect, it } from "vitest";
import { imt, maxViablePrice, simulatePurchase, stampAcquisition } from "./financial-simulator";

describe("IMT e Selo 2026 (Continente)", () => {
  it("HPP: 250 000 € → 7 042,04 € (250 000 × 7% − 10 457,96)", () => {
    expect(imt(250_000, "hpp", false)).toBe(7042.04);
  });
  it("HPP: isento até 106 346 €; 385 000 € → 17 036,65 €", () => {
    expect(imt(100_000, "hpp", false)).toBe(0);
    expect(imt(385_000, "hpp", false)).toBe(17036.65);
  });
  it("IMT Jovem: isento até 330 539 €; 365 000 € paga só sobre o excesso", () => {
    expect(imt(300_000, "hpp", true)).toBe(0);
    expect(imt(365_000, "hpp", true)).toBe(2756.88);
    expect(stampAcquisition(365_000, "hpp", true)).toBe(275.69);
  });
  it("secundária paga desde o primeiro euro", () => {
    expect(imt(100_000, "secondary", false)).toBe(1000);
  });
  it("Selo da compra 0,8%", () => {
    expect(stampAcquisition(385_000, "hpp", false)).toBe(3080);
  });
});

describe("crédito e capitais", () => {
  it("crédito a 90% do MENOR entre preço e avaliação", () => {
    const s = simulatePurchase({ price: 385_000, appraisal: 365_000, ownFunds: 45_000 });
    expect(s.loanBasis).toBe(365_000);
    expect(s.loan).toBe(328_500);
    expect(s.entry).toBe(56_500);
    expect(Math.round(s.totalNeeded)).toBe(80_388);
    expect(Math.round(s.gap)).toBe(35_388);
  });
  it("pré-aprovação limita o crédito", () => {
    expect(simulatePurchase({ price: 200_000, ownFunds: 50_000, loanCap: 150_000 }).loan).toBe(150_000);
  });
  it("pressupostos ficam sempre ditos", () => {
    const s = simulatePurchase({ price: 300_000, ownFunds: 50_000 });
    expect(s.assumptions).toContain("habitação própria e permanente (assumido)");
    expect(s.assumptions).toContain("sem IMT Jovem (idade por confirmar)");
    expect(s.assumptions.join(" ")).toMatch(/estimativas/);
  });
  it("preço máximo que fecha com os capitais", () => {
    expect(maxViablePrice({ appraisal: 365_000, ownFunds: 45_000 })).toBe(292_000);
    expect(maxViablePrice({ ownFunds: 15_000, loanCap: 150_000 })).toBe(114_000);
    expect(maxViablePrice({ ownFunds: 15_000, loanCap: 150_000, young: true, ltv: 1 })).toBe(162_000);
  });
});

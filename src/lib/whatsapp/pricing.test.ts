import { describe, it, expect } from "vitest";
import { countryFromPhone, estimateTemplateCost, pickRate, isBillable } from "./pricing";

const rates = [
  { category: "utility", country_code: "PT", price_eur: 0.035, effective_from: "2026-01-01" },
  { category: "utility", country_code: "PT", price_eur: 0.04, effective_from: "2026-06-01" },
  { category: "utility", country_code: "*", price_eur: 0.09, effective_from: "2026-01-01" },
  { category: "marketing", country_code: "PT", price_eur: 0.11, effective_from: "2026-01-01" },
];

describe("pricing WhatsApp", () => {
  it("descobre o país pelo E.164", () => {
    expect(countryFromPhone("+351912345678")).toBe("PT");
    expect(countryFromPhone("34600000000")).toBe("ES");
    expect(countryFromPhone("")).toBe("??");
  });

  it("só é faturável quando é template fora da janela", () => {
    expect(isBillable({ isTemplate: true, outsideWindow: true })).toBe(true);
    expect(isBillable({ isTemplate: true, outsideWindow: false })).toBe(false);
    expect(isBillable({ isTemplate: false, outsideWindow: true })).toBe(false);
  });

  it("usa a tarifa em vigor mais recente e prefere o país exacto", () => {
    const r = pickRate(rates as any, { category: "utility", country: "PT", at: new Date("2026-08-01") });
    expect(r?.price_eur).toBe(0.04);
    const older = pickRate(rates as any, { category: "utility", country: "PT", at: new Date("2026-03-01") });
    expect(older?.price_eur).toBe(0.035);
    const generic = pickRate(rates as any, { category: "utility", country: "BR", at: new Date("2026-08-01") });
    expect(generic?.price_eur).toBe(0.09);
  });

  it("custo zero dentro da janela, null sem tarifa, valor com tarifa", () => {
    expect(
      estimateTemplateCost({ isTemplate: true, outsideWindow: false, category: "utility", toPhone: "+351912345678", rates: rates as any }).costEur,
    ).toBe(0);
    expect(
      estimateTemplateCost({ isTemplate: true, outsideWindow: true, category: "authentication", toPhone: "+351912345678", rates: rates as any }).costEur,
    ).toBeNull();
    const est = estimateTemplateCost({
      isTemplate: true, outsideWindow: true, category: "utility",
      toPhone: "+351912345678", rates: rates as any, at: new Date("2026-08-01"),
    });
    expect(est).toMatchObject({ billable: true, costEur: 0.04 });
  });
});

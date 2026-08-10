import { describe, expect, it } from "vitest";
import { lisbonYmd, ymdDiffDays, endOfLisbonDayIso } from "./lisbon-day";

describe("dia de calendário em Lisboa", () => {
  it("golden: evento de ontem às 22h (Verão) não é hoje", () => {
    const ontem22 = new Date("2026-08-09T21:00:00Z"); // 22h em Lisboa
    const agora = new Date("2026-08-10T07:02:00Z");
    expect(lisbonYmd(ontem22)).toBe("2026-08-09");
    expect(ymdDiffDays(lisbonYmd(agora), lisbonYmd(ontem22))).toBe(1);
  });

  it("data solta sem hora mantém-se o mesmo dia", () => {
    expect(lisbonYmd("2026-08-09")).toBe("2026-08-09");
  });

  it("fim do dia de Lisboa cobre eventos da noite", () => {
    const iso = endOfLisbonDayIso(new Date("2026-08-10T07:02:00Z"));
    expect(lisbonYmd(iso)).toBe("2026-08-10");
    expect(new Date(iso).toISOString()).toBe("2026-08-10T22:59:59.999Z");
  });
});

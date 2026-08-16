import { describe, expect, it } from "vitest";
import { dayWindowStartIso, startOfLocalDay, MIN_WINDOW_MS } from "./day-window";

describe("janela do dia no chat do painel", () => {
  it("meio do dia: janela começa à meia-noite local", () => {
    const now = new Date("2026-08-16T13:00:00Z"); // 14:00 Lisboa
    expect(dayWindowStartIso(now)).toBe("2026-08-15T23:00:00.000Z");
    expect(startOfLocalDay(now)).toBe(Date.parse("2026-08-15T23:00:00Z"));
  });

  it("madrugada: nunca fica mais curta do que 12h", () => {
    const now = new Date("2026-08-16T00:15:00Z"); // 01:15 Lisboa
    expect(dayWindowStartIso(now)).toBe(new Date(now.getTime() - MIN_WINDOW_MS).toISOString());
  });

  it("a janela nunca inclui mensagens de anteontem", () => {
    const now = new Date("2026-08-16T13:00:00Z");
    expect(Date.parse(dayWindowStartIso(now))).toBeGreaterThan(Date.parse("2026-08-14T23:59:59Z"));
  });
});

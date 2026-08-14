// Horário final em Lisboa a partir de due_date + due_time.
// Casos-limite: meia-noite, verão/inverno (DST) e saltos de dia.
import { describe, expect, it } from "vitest";
import { eventStartMs } from "../proactive/meeting-briefing";
import { eventWindow, isEventOver, DEFAULT_EVENT_MINUTES } from "../supreme/event-window";

const iso = (ms: number) => new Date(ms).toISOString();
const start = (due_date: string, due_time: string | null) =>
  iso(eventStartMs({ due_date, due_time } as never));

describe("eventStartMs — hora local de Lisboa", () => {
  it("verão (UTC+1): 09:00 em Lisboa = 08:00 UTC", () => {
    expect(start("2026-08-14T00:00:00Z", "09:00")).toBe("2026-08-14T08:00:00.000Z");
  });

  it("inverno (UTC+0): 09:00 em Lisboa = 09:00 UTC", () => {
    expect(start("2026-01-14T00:00:00Z", "09:00")).toBe("2026-01-14T09:00:00.000Z");
  });

  it("meia-noite no verão cai no dia anterior em UTC", () => {
    expect(start("2026-08-14T00:00:00Z", "00:00")).toBe("2026-08-13T23:00:00.000Z");
  });

  it("meia-noite no inverno mantém-se no mesmo dia", () => {
    expect(start("2026-01-14T00:00:00Z", "00:00")).toBe("2026-01-14T00:00:00.000Z");
  });

  it("23:59 no verão continua no mesmo dia de calendário de Lisboa", () => {
    expect(start("2026-08-14T00:00:00Z", "23:59")).toBe("2026-08-14T22:59:00.000Z");
  });

  it("due_date com hora tardia usa o dia de Lisboa, não o dia UTC", () => {
    // 2026-08-09T23:30Z já é dia 10 em Lisboa (00:30).
    expect(start("2026-08-09T23:30:00Z", "10:00")).toBe("2026-08-10T09:00:00.000Z");
  });

  it("data solta (sem hora no due_date) resolve o mesmo dia", () => {
    expect(start("2026-08-14", "15:30")).toBe("2026-08-14T14:30:00.000Z");
  });

  it("dia da mudança de hora (25/10/2026): 09:00 já é UTC+0", () => {
    expect(start("2026-10-25T12:00:00Z", "09:00")).toBe("2026-10-25T09:00:00.000Z");
  });

  it("véspera da mudança de hora (24/10/2026): 09:00 ainda é UTC+1", () => {
    expect(start("2026-10-24T12:00:00Z", "09:00")).toBe("2026-10-24T08:00:00.000Z");
  });

  it("salto de mês/ano: 31/12 às 23:30 no inverno", () => {
    expect(start("2026-12-31T00:00:00Z", "23:30")).toBe("2026-12-31T23:30:00.000Z");
  });

  it("sem due_time devolve o instante do due_date", () => {
    expect(start("2026-08-14T06:00:00Z", null)).toBe("2026-08-14T06:00:00.000Z");
  });

  it("due_time inválido não rebenta — cai no due_date", () => {
    expect(start("2026-08-14T06:00:00Z", "amanhã")).toBe("2026-08-14T06:00:00.000Z");
  });

  it("due_date inválido devolve NaN", () => {
    expect(Number.isNaN(eventStartMs({ due_date: "sem data", due_time: "09:00" } as never))).toBe(true);
  });
});

describe("eventWindow — janela coerente com o início", () => {
  it("verão: janela de 09:00 a 10:00 em Lisboa", () => {
    const w = eventWindow({ due_date: "2026-08-14T00:00:00Z", due_time: "09:00" });
    expect(w.startIso).toBe("2026-08-14T08:00:00.000Z");
    expect(w.endIso).toBe("2026-08-14T09:00:00.000Z");
    expect(DEFAULT_EVENT_MINUTES).toBe(60);
  });

  it("meia-noite: a janela atravessa a fronteira do dia UTC", () => {
    const w = eventWindow({ due_date: "2026-08-14T00:00:00Z", due_time: "00:00" });
    expect(w.startIso).toBe("2026-08-13T23:00:00.000Z");
    expect(w.endIso).toBe("2026-08-14T00:00:00.000Z");
  });

  it("23:30 + 60 min salta para o dia seguinte", () => {
    const w = eventWindow({ due_date: "2026-12-31T00:00:00Z", due_time: "23:30" });
    expect(w.endIso).toBe("2027-01-01T00:30:00.000Z");
  });

  it("evento das 23:30 ainda não terminou às 23:45 de Lisboa", () => {
    const ev = { due_date: "2026-12-31T00:00:00Z", due_time: "23:30" };
    expect(isEventOver(ev, new Date("2026-12-31T23:45:00Z"))).toBe(false);
    expect(isEventOver(ev, new Date("2027-01-01T00:31:00Z"))).toBe(true);
  });
});

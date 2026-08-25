// Golden: a hora pedida pelo consultor é a hora que aparece no calendário.
// Regressão de 25/08/2026: "às 21h" saía à 01h (due_time ignorado).
import { describe, expect, it } from "vitest";
import { outboundWindow } from "./event-body";
import { toGoogleBody, toOutlookBody, type LocalEvent } from "./sync.server";

const ev = (due_date: string, due_time: string | null): LocalEvent => ({
  id: "1", title: "teste", notes: null, due_date, due_time,
  status: "agendado", type: "evento", updated_at: null,
});

describe("hora enviada ao calendário", () => {
  it("caso real: 21h de 26/08 (verão) = 20:00Z, não 00:00Z", () => {
    const w = outboundWindow(ev("2026-08-26T00:00:00+00:00", "21:00"));
    expect(w.startIso).toBe("2026-08-26T20:00:00.000Z");
    expect(w.endIso).toBe("2026-08-26T21:00:00.000Z");
  });

  it("manhã: 09h de Lisboa no verão = 08:00Z", () => {
    expect(outboundWindow(ev("2026-08-26T00:00:00+00:00", "09:00")).startIso)
      .toBe("2026-08-26T08:00:00.000Z");
  });

  it("inverno (UTC+0): 21h = 21:00Z", () => {
    expect(outboundWindow(ev("2026-01-20T00:00:00+00:00", "21:00")).startIso)
      .toBe("2026-01-20T21:00:00.000Z");
  });

  it("sem hora marcada usa o instante de due_date", () => {
    expect(outboundWindow(ev("2026-08-26T07:15:00+00:00", null)).startIso)
      .toBe("2026-08-26T07:15:00.000Z");
  });

  it("corpo Google leva o instante correto com timeZone de Lisboa", () => {
    const b = toGoogleBody(ev("2026-08-26T00:00:00+00:00", "21:00"));
    expect(b.start).toEqual({ dateTime: "2026-08-26T20:00:00.000Z", timeZone: "Europe/Lisbon" });
    expect(b.end.dateTime).toBe("2026-08-26T21:00:00.000Z");
  });

  it("corpo Outlook leva o mesmo instante em UTC sem sufixo Z", () => {
    const b = toOutlookBody(ev("2026-08-26T00:00:00+00:00", "21:00"));
    expect(b.start).toEqual({ dateTime: "2026-08-26T20:00:00.000", timeZone: "UTC" });
  });

  it("dashboard e calendário mostram a mesma hora local", () => {
    const row = ev("2026-08-26T00:00:00+00:00", "21:00");
    const startIso = outboundWindow(row).startIso;
    const hhmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon", hour12: false, hour: "2-digit", minute: "2-digit",
    }).format(new Date(startIso));
    expect(hhmm).toBe(row.due_time);
  });
});

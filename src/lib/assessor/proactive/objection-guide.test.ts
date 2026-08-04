import { describe, expect, it } from "vitest";
import {
  formatObjectionGuide,
  isAngariacaoMeeting,
  isGuideDue,
  type GuideEvent,
} from "./objection-guide";

const base = (over: Partial<GuideEvent> = {}): GuideEvent => ({
  id: "e1",
  title: "Reunião de angariação",
  due_date: "2026-08-04T17:30:00.000Z",
  due_time: null,
  type: "Evento",
  status: "Pendente",
  person_id: "p1",
  ...over,
});

describe("guião de objeções", () => {
  it("reconhece reuniões de angariação (e variantes)", () => {
    expect(isAngariacaoMeeting(base())).toBe(true);
    expect(isAngariacaoMeeting(base({ title: "Captação Sr. Silva" }))).toBe(true);
    expect(isAngariacaoMeeting(base({ title: "Visita", notes: "é uma angariação" }))).toBe(true);
    expect(isAngariacaoMeeting(base({ title: "Visita com comprador", notes: null }))).toBe(false);
  });

  it("dispara 10 min antes e não depois da tolerância", () => {
    const start = new Date("2026-08-04T17:30:00.000Z").getTime();
    expect(isGuideDue(base(), start - 9 * 60_000)).toBe(true);
    expect(isGuideDue(base(), start - 20 * 60_000)).toBe(false);
    expect(isGuideDue(base(), start + 10 * 60_000)).toBe(false);
  });

  it("nunca repete depois de enviado", () => {
    const start = new Date("2026-08-04T17:30:00.000Z").getTime();
    const ev = base({ objection_guide_sent_at: "2026-08-04T17:21:00.000Z" });
    expect(isGuideDue(ev, start - 9 * 60_000)).toBe(false);
  });

  it("escreve o guião com o contexto do imóvel", () => {
    const start = new Date("2026-08-04T17:30:00.000Z").getTime();
    const text = formatObjectionGuide(
      base(),
      { personName: "Iolanda", propertyTitle: "T3 na Feira", askingPrice: 250000 },
      start - 10 * 60_000,
    );
    expect(text).toContain("Iolanda");
    expect(text).toContain("T3 na Feira");
    expect(text).toContain("Guião de objeções");
    expect(text).toContain("comissão");
  });
});
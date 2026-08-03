import { describe, expect, it } from "vitest";
import {
  eventStartMs,
  formatMeetingBriefing,
  hasBriefContent,
  isBriefingDue,
  type BriefingEvent,
} from "./meeting-briefing";

const base: BriefingEvent = {
  id: "e1",
  title: "Visita ao T2 de Benfica",
  due_date: "2026-08-03T14:30:00Z",
  due_time: null,
  status: "Pendente",
  person_id: "p1",
  briefing_sent_at: null,
};

const brief = {
  name: "Rui Neves",
  relationship: "comprador",
  phone: "351912345678",
  lastInteraction: { when: "2026-07-20T10:00:00Z", text: "Quer ver o T2 de Benfica." },
  properties: [],
  deals: [],
  nextAction: { text: "Confirmar visita", when: null },
};

describe("cartela de briefing", () => {
  it("dispara nos 15 minutos antes", () => {
    const now = new Date("2026-08-03T14:16:00Z").getTime();
    expect(isBriefingDue(base, now)).toBe(true);
  });

  it("não dispara cedo demais", () => {
    expect(isBriefingDue(base, new Date("2026-08-03T13:50:00Z").getTime())).toBe(false);
  });

  it("nunca duplica quando já foi enviada", () => {
    const sent = { ...base, briefing_sent_at: "2026-08-03T14:16:00Z" };
    expect(isBriefingDue(sent, new Date("2026-08-03T14:17:00Z").getTime())).toBe(false);
  });

  it("ignora compromissos sem pessoa ou já fechados", () => {
    const now = new Date("2026-08-03T14:20:00Z").getTime();
    expect(isBriefingDue({ ...base, person_id: null }, now)).toBe(false);
    expect(isBriefingDue({ ...base, status: "Concluído" }, now)).toBe(false);
  });

  it("respeita due_time em hora de Lisboa", () => {
    const ms = eventStartMs({ due_date: "2026-08-03T00:00:00Z", due_time: "15:30" });
    expect(new Date(ms).toISOString()).toBe("2026-08-03T14:30:00.000Z");
  });

  it("não considera relevante um resumo vazio", () => {
    expect(hasBriefContent({ name: "X", properties: [], deals: [] } as any)).toBe(false);
    expect(hasBriefContent(brief as any)).toBe(true);
  });

  it("escreve o motivo do compromisso e a pessoa", () => {
    const text = formatMeetingBriefing(base, brief as any, new Date("2026-08-03T14:16:00Z").getTime());
    expect(text).toContain("Visita ao T2 de Benfica");
    expect(text).toContain("Rui Neves");
    expect(text).toContain("Confirmar visita");
    expect(text.startsWith("Daqui a 14 min")).toBe(true);
  });
});
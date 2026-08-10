import { describe, it, expect } from "vitest";
import { simulateBriefing } from "./briefing-simulator";

const now = new Date("2026-08-10T09:00:00Z");

describe("simulador de briefing", () => {
  it("aniversário importado do calendário fica fora, mesmo na data de hoje", () => {
    const r = simulateBriefing(
      { title: "Aniversário de Maria", due_date: "2026-08-10", from_calendar: true },
      now,
    );
    expect(r.inAgenda).toBe(false);
    expect(r.isLeisure).toBe(true);
  });

  it("visita ligada a imóvel entra e gera check-in depois de terminar", () => {
    const base = {
      title: "Visita ao T3", type: "visita", due_date: "2026-08-10",
      related_property_id: "i1", from_calendar: true,
    };
    expect(simulateBriefing({ ...base, due_time: "18:00" }, now).inAgenda).toBe(true);
    expect(simulateBriefing({ ...base, due_time: "18:00" }, now).generatesCheckIn).toBe(true);
    expect(simulateBriefing({ ...base, due_time: "08:00" }, now).inAgenda).toBe(false);
  });

  it("almoço sem contexto não gera check-in", () => {
    const r = simulateBriefing({ title: "Almoço", due_date: "2026-08-10", due_time: "13:00" }, now);
    expect(r.generatesCheckIn).toBe(false);
  });

  it("item fechado sai logo no primeiro passo", () => {
    const r = simulateBriefing({ title: "Reunião", due_date: "2026-08-10", status: "concluído" }, now);
    expect(r.inAgenda).toBe(false);
    expect(r.steps[0]!.passed).toBe(false);
  });
});

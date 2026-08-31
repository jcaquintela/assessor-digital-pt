import { describe, it, expect, vi } from "vitest";
import { composeEmptyDayBriefing, emptyDaySuggestion, EMPTY_DAY_SUGGESTIONS } from "./empty-day";
import { composeBriefingText } from "../supreme/briefing.server";

vi.mock("@/lib/whatsapp/send.server", () => ({ sendWhatsAppPayload: vi.fn() }));

describe("briefing em dia sem prioridades", () => {
  it("1) dia útil sem prioridades gera sugestão de acção, não silêncio", () => {
    const t = composeEmptyDayBriefing("Júlio", new Date("2026-08-13T07:02:00Z"));
    expect(t).toContain("Bom dia, Júlio.");
    expect(t).toContain("agenda está livre");
    expect(t.length).toBeGreaterThan(40);
  });

  it("2) com prioridades o briefing nomeia a prioridade (formato enriquecido)", () => {
    const t = composeBriefingText([
      { action: "Ligar ao proprietário", entity_label: "Sr. Costa", reasons: ["sem contacto há 5 dias"] },
    ]);
    expect(t).toContain("Ligar ao proprietário");
    expect(t).not.toContain("agenda está livre");
  });


  it("3) duas semanas seguidas sem prioridades variam o texto", () => {
    const w1 = emptyDaySuggestion(new Date("2026-08-13T07:02:00Z"));
    const w2 = emptyDaySuggestion(new Date("2026-08-20T07:02:00Z"));
    const w3 = emptyDaySuggestion(new Date("2026-08-27T07:02:00Z"));
    expect(w1).not.toBe(w2);
    expect(w2).not.toBe(w3);
    expect(EMPTY_DAY_SUGGESTIONS).toContain(w1);
  });

  it("4) mesma semana mantém o mesmo texto (estável no dia)", () => {
    expect(emptyDaySuggestion(new Date("2026-08-13T07:02:00Z")))
      .toBe(emptyDaySuggestion(new Date("2026-08-14T07:02:00Z")));
  });
});

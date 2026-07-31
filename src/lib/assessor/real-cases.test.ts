import { describe, it, expect } from "vitest";
import { detectMiscQuery, detectAgendaQuery } from "@/lib/assessor/v3/deterministic.server";
import { ensureTitle, displayTitle, cleanTitle } from "@/lib/assessor/titles";

describe("casos reais 29/07", () => {
  it("event_type null nunca aparece na resposta", () => {
    expect(cleanTitle("null")).toBeNull();
    expect(displayTitle(null)).toBe("compromisso");
    expect(ensureTitle("null")).toBe("Lembrete");
  });
  it("Diversos o que tenho? não é agenda", () => {
    expect(detectAgendaQuery("Diversos o que tenho?")).toBeFalsy();
    expect(detectMiscQuery("Diversos o que tenho?")).toBe(true);
  });
  it("O que tenho hoje? continua agenda", () => {
    expect(detectAgendaQuery("O que tenho hoje?")).toBeTruthy();
  });
});

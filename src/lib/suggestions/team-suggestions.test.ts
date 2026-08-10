import { describe, it, expect } from "vitest";
import { isTeamSuggestion, teamStateLabel } from "./team-suggestions";

describe("sugestões para a equipa", () => {
  it("apanha pela categoria, com ou sem acento", () => {
    expect(isTeamSuggestion({ category: "sugestao", title: "Filtro por zona" })).toBe(true);
    expect(isTeamSuggestion({ category: "Sugestão", title: "Filtro por zona" })).toBe(true);
  });

  it("apanha pelo título antigo", () => {
    expect(isTeamSuggestion({ title: "Sugestão para a equipa" })).toBe(true);
  });

  it("apanha por etiqueta", () => {
    expect(isTeamSuggestion({ title: "Ideia", tags: ["sugestao"] })).toBe(true);
  });

  it("não apanha notas normais do consultor", () => {
    expect(isTeamSuggestion({ title: "Nota sobre o Sr. Coelho", category: "nota" })).toBe(false);
    expect(isTeamSuggestion({ title: "Ficheiro sem destino", category: "ficheiro" })).toBe(false);
    expect(isTeamSuggestion({})).toBe(false);
  });

  it("mostra o estado certo ao consultor", () => {
    expect(teamStateLabel(null)).toBe("Visível para a equipa");
    expect(teamStateLabel("2026-01-01T10:00:00Z")).toBe("Recebida pela equipa");
  });
});
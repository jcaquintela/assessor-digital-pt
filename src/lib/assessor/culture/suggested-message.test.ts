import { describe, it, expect } from "vitest";
import {
  splitSuggestedMessage,
  withSuggestion,
  stripSuggestionMarker,
} from "./suggested-message";

describe("mensagens sugeridas saem isoladas", () => {
  it("separa quando vem marcada", () => {
    const reply = withSuggestion(
      "Posso pedir a documentação ao proprietário. Sugiro algo simples:",
      "Boa tarde, Sr. Coelho. Para avançarmos, precisava da caderneta predial. Consegue enviar?",
    );
    const s = splitSuggestedMessage(reply)!;
    expect(s.intro).toContain("Sugiro algo simples:");
    expect(s.suggestion.startsWith("Boa tarde")).toBe(true);
    expect(s.suggestion).not.toContain("Sugiro");
  });

  it("separa itálico colado à introdução", () => {
    const s = splitSuggestedMessage(
      'Sugiro algo simples: _Boa tarde, consegue enviar-me a caderneta predial?_',
    )!;
    expect(s.intro).toBe("Sugiro algo simples:");
    expect(s.suggestion).toBe("Boa tarde, consegue enviar-me a caderneta predial?");
  });

  it("limpa aspas e itálicos por linha", () => {
    const s = splitSuggestedMessage(
      'Podes enviar:\n_Boa tarde, sou o Rui._\n_Quando lhe der jeito falamos?_',
    )!;
    expect(s.suggestion).toBe("Boa tarde, sou o Rui.\nQuando lhe der jeito falamos?");
  });

  it("conversa normal não é separada", () => {
    expect(splitSuggestedMessage("Marquei a visita amanhã às 15h.")).toBeNull();
    expect(splitSuggestedMessage("Queres que te lembre de ligar?")).toBeNull();
    expect(splitSuggestedMessage("Sugiro que ligues hoje.")).toBeNull();
  });

  it("o marcador nunca chega ao consultor", () => {
    expect(stripSuggestionMarker(withSuggestion("Olá:", "Texto"))).not.toContain("[[SUGESTAO]]");
  });
});
import { describe, it, expect } from "vitest";
import {
  splitSuggestedMessage,
  withSuggestion,
  stripSuggestionMarker,
  normalizeSuggestedText,
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
describe("normalizeSuggestedText: o que se vê é o que se copia", () => {
  it("mensagens vazias devolvem string vazia", () => {
    expect(normalizeSuggestedText("")).toBe("");
    expect(normalizeSuggestedText(null)).toBe("");
    expect(normalizeSuggestedText(undefined)).toBe("");
    expect(normalizeSuggestedText("   \n\n\t  ")).toBe("");
  });

  it("uniformiza quebras de linha CRLF e CR", () => {
    expect(normalizeSuggestedText("Boa tarde,\r\nSr. Coelho.\rObrigado.")).toBe(
      "Boa tarde,\nSr. Coelho.\nObrigado.",
    );
  });

  it("colapsa linhas em branco a mais para no máximo uma", () => {
    expect(normalizeSuggestedText("Primeira linha.\n\n\n\nSegunda linha.")).toBe(
      "Primeira linha.\n\nSegunda linha.",
    );
  });

  it("tira espaços no início/fim de cada linha e nas pontas", () => {
    expect(normalizeSuggestedText("   Boa tarde.   \n\t  Consegue falar?  \n")).toBe(
      "Boa tarde.\nConsegue falar?",
    );
  });

  it("converte espaços não separáveis em espaços normais", () => {
    expect(normalizeSuggestedText("Boa\u00a0tarde,\u00a0Sr. Coelho.")).toBe("Boa tarde, Sr. Coelho.");
  });

  it("remove itálicos e aspas aninhadas à volta do bloco", () => {
    expect(normalizeSuggestedText('"_Boa tarde, consegue enviar a caderneta?_"')).toBe(
      "Boa tarde, consegue enviar a caderneta?",
    );
    expect(normalizeSuggestedText("«*Boa tarde, falamos amanhã?*»")).toBe("Boa tarde, falamos amanhã?");
    expect(normalizeSuggestedText("**Boa tarde, tudo bem?**")).toBe("Boa tarde, tudo bem?");
  });

  it("limpa itálicos linha a linha sem juntar linhas", () => {
    expect(normalizeSuggestedText("_Boa tarde, sou o Rui._\n_Quando lhe der jeito falamos?_")).toBe(
      "Boa tarde, sou o Rui.\nQuando lhe der jeito falamos?",
    );
  });

  it("não estraga ênfases no meio da frase", () => {
    expect(normalizeSuggestedText("Boa tarde, o valor _final_ é 200.000€.")).toBe(
      "Boa tarde, o valor _final_ é 200.000€.",
    );
  });

  it("é idempotente (copiar o já normalizado dá o mesmo)", () => {
    const raw = '  "_Boa tarde.\r\n\r\n\r\n  Consegue falar hoje?_"  ';
    const once = normalizeSuggestedText(raw);
    expect(normalizeSuggestedText(once)).toBe(once);
  });

  it("aguenta mensagens muito longas sem truncar nem rebentar", () => {
    const paragrafo = "Boa tarde, Sr. Coelho. ".repeat(500).trim();
    const raw = `_${paragrafo}_\n\n\n${paragrafo}   `;
    const out = normalizeSuggestedText(raw);
    expect(out.startsWith("Boa tarde")).toBe(true);
    expect(out.endsWith("Sr. Coelho.")).toBe(true);
    expect(out).toContain("\n\n");
    expect(out).not.toContain("\n\n\n");
    expect(out.length).toBeGreaterThan(20_000);
  });

  it("o texto separado já vem normalizado", () => {
    const s = splitSuggestedMessage(withSuggestion("Podes enviar:", '  "_Boa tarde.\r\n\r\n\r\nFalamos?_"  '))!;
    expect(s.suggestion).toBe("Boa tarde.\n\nFalamos?");
    expect(normalizeSuggestedText(s.suggestion)).toBe(s.suggestion);
  });
});

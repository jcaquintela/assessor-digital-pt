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

describe("normalizeSuggestedText: parágrafos, listas e quebras mistas", () => {
  it("mantém vários parágrafos separados por uma linha em branco", () => {
    const raw = "Boa tarde, Sr. Coelho.\r\n\r\n\r\nJá tenho a avaliação do terreno.\n\n\nDiga-me quando podemos falar.";
    expect(normalizeSuggestedText(raw)).toBe(
      "Boa tarde, Sr. Coelho.\n\nJá tenho a avaliação do terreno.\n\nDiga-me quando podemos falar.",
    );
  });

  it("preserva listas com travessão e mistura CRLF/CR/LF", () => {
    const raw = "Boa tarde.\r\n\r\n- Caderneta predial\r- Certidão permanente\n- Planta\r\n\r\nObrigado.";
    expect(normalizeSuggestedText(raw)).toBe(
      "Boa tarde.\n\n- Caderneta predial\n- Certidão permanente\n- Planta\n\nObrigado.",
    );
  });

  it("preserva listas numeradas mesmo com itálicos por linha", () => {
    const raw = "_Boa tarde._\r\n\r\n_1. Avaliação_\n_2. Documentos_\r\n_3. Visita_\r\n\r\n\r\n_Obrigado._";
    expect(normalizeSuggestedText(raw)).toBe(
      "Boa tarde.\n\n1. Avaliação\n2. Documentos\n3. Visita\n\nObrigado.",
    );
  });

  it("achata indentação de sublistas (o canal não a preserva)", () => {
    expect(normalizeSuggestedText("- Documentos\n    - Caderneta\n\t- Certidão")).toBe(
      "- Documentos\n- Caderneta\n- Certidão",
    );
  });

  it("não colapsa listas com linhas em branco entre itens", () => {
    expect(normalizeSuggestedText("• Um\n\n• Dois\n\n\n\n• Três")).toBe("• Um\n\n• Dois\n\n• Três");
  });

  it("mesmo conteúdo com CRLF, CR ou LF dá exatamente a mesma string", () => {
    const base = "Boa tarde.\n\n- Um\n- Dois\n\nObrigado.";
    const crlf = base.replace(/\n/g, "\r\n");
    const cr = base.replace(/\n/g, "\r");
    expect(normalizeSuggestedText(crlf)).toBe(normalizeSuggestedText(base));
    expect(normalizeSuggestedText(cr)).toBe(normalizeSuggestedText(base));
    expect(normalizeSuggestedText(base)).toBe(base);
  });

  it("bloco multi-parágrafo em aspas continua a sair limpo e idempotente", () => {
    const raw = '"Boa tarde, Sr. Coelho.\r\n\r\n- Caderneta\r- Certidão\r\n\r\nObrigado."';
    const out = normalizeSuggestedText(raw);
    expect(out).toBe("Boa tarde, Sr. Coelho.\n\n- Caderneta\n- Certidão\n\nObrigado.");
    expect(normalizeSuggestedText(out)).toBe(out);
  });

  it("a separação de sugestões multi-parágrafo devolve o mesmo texto normalizado", () => {
    const suggestion = "Boa tarde.\r\n\r\n- Caderneta\r- Certidão\r\n\r\nObrigado.";
    const s = splitSuggestedMessage(withSuggestion("Podes enviar:", suggestion))!;
    expect(s.suggestion).toBe(normalizeSuggestedText(suggestion));
    expect(s.suggestion).toBe("Boa tarde.\n\n- Caderneta\n- Certidão\n\nObrigado.");
  });
});

describe("normalizeSuggestedText: Unicode PT-PT", () => {
  it("remove aspas tipográficas a envolver o texto todo", () => {
    expect(normalizeSuggestedText("“Boa tarde, Sr. Coelho.”")).toBe("Boa tarde, Sr. Coelho.");
    expect(normalizeSuggestedText("«Boa tarde — falamos hoje?»")).toBe("Boa tarde — falamos hoje?");
    expect(normalizeSuggestedText("‘Boa tarde, tudo bem?’")).toBe("Boa tarde, tudo bem?");
  });

  it("remove camadas mistas de aspas curvas e itálico", () => {
    expect(normalizeSuggestedText("“_Boa tarde, consegue enviar a caderneta?_”")).toBe(
      "Boa tarde, consegue enviar a caderneta?",
    );
    expect(normalizeSuggestedText("«**Boa tarde, falamos amanhã?**»")).toBe("Boa tarde, falamos amanhã?");
  });

  it("preserva aspas e apóstrofos curvos no interior da frase", () => {
    expect(normalizeSuggestedText("Boa tarde — o Sr. Coelho disse que está “tudo bem”.")).toBe(
      "Boa tarde — o Sr. Coelho disse que está “tudo bem”.",
    );
    expect(normalizeSuggestedText("Falei com a D’Ávila e com o l’Escola.")).toBe(
      "Falei com a D’Ávila e com o l’Escola.",
    );
  });

  it("preserva travessões, meias-riscas e reticências", () => {
    expect(normalizeSuggestedText("Traço – meia risca e — travessão…")).toBe("Traço – meia risca e — travessão…");
  });

  it("preserva acentuação, cedilha e o símbolo do euro", () => {
    expect(normalizeSuggestedText("  Avaliação: 200.000 €. Atenção à cedilha e ao “ã”.  ")).toBe(
      "Avaliação: 200.000 €. Atenção à cedilha e ao “ã”.",
    );
  });

  it("normaliza espaços não separáveis à volta do euro sem perder o símbolo", () => {
    expect(normalizeSuggestedText("Preço:\u00a0200\u00a0000\u00a0€ – negociável ")).toBe(
      "Preço: 200 000 € – negociável",
    );
  });

  it("aspas curvas por linha em listas multi-parágrafo", () => {
    const raw = "“Boa tarde.”\r\n\r\n“- Caderneta”\r“- Certidão”\r\n\r\n“Obrigado.”";
    expect(normalizeSuggestedText(raw)).toBe("Boa tarde.\n\n- Caderneta\n- Certidão\n\nObrigado.");
  });

  it("mantém-se idempotente com pontuação tipográfica", () => {
    const once = normalizeSuggestedText("“Boa tarde — d’Ávila…”\r\n\r\n\r\n“Obrigado.”");
    expect(normalizeSuggestedText(once)).toBe(once);
    expect(once).toBe("Boa tarde — d’Ávila…\n\nObrigado.");
  });
});

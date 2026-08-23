// Casos reais (Iolanda, 20–22/08): confirmações elípticas ancoradas ao item
// do último briefing e proibição de confirmação sem escrita.

import { describe, it, expect } from "vitest";
import {
  parseBriefingItems,
  hintFromBriefingItem,
  isEllipticCompletion,
  anchorFromBriefing,
} from "./briefing-anchor";
import { claimsCompletion, detectCompletionInstructions } from "./completion-intent";

const BRIEF_1 = "Bom dia, Iolanda. Hoje o que interessa é isto:\n- Lembrete: Marcação das unhas";
const BRIEF_3 = `${BRIEF_1}\n- Comprar envelopes\n- Começar a fazer as malas`;

describe("âncora do briefing", () => {
  it("lê os itens da lista", () => {
    expect(parseBriefingItems(BRIEF_3)).toHaveLength(3);
    expect(parseBriefingItems(BRIEF_1)).toEqual(["Lembrete: Marcação das unhas"]);
  });

  it("a pista tira o prefixo 'Lembrete:'", () => {
    expect(hintFromBriefingItem("Lembrete: Marcação das unhas")).toBe("marcacao das unhas");
  });

  it("golden 1 — 'Já está concluída, já te tinha avisado' ancora ao item único", () => {
    const msg = "Já está concluída , já te tinha avisado";
    // O extractor de assunto já não inventa "tinha avisado".
    expect(detectCompletionInstructions(msg)).toEqual([]);
    expect(isEllipticCompletion(msg)).toBe(true);
    expect(anchorFromBriefing({ content: BRIEF_1, message_type: "proactive_morning" })?.subjectHint)
      .toBe("marcacao das unhas");
  });

  it("golden 2 — 'Podes dar como concluída' usa a mesma âncora", () => {
    const msg = "Podes dar como concluída";
    expect(detectCompletionInstructions(msg)).toEqual([]);
    expect(isEllipticCompletion(msg)).toBe(true);
    expect(anchorFromBriefing({ content: BRIEF_1, message_type: "proactive_morning" })).not.toBeNull();
  });

  it("sem âncora quando o briefing tem vários itens ou não é briefing", () => {
    expect(anchorFromBriefing({ content: BRIEF_3, message_type: "proactive_morning" })).toBeNull();
    expect(anchorFromBriefing({ content: BRIEF_1, message_type: "whatsapp_text" })).toBeNull();
    expect(anchorFromBriefing(null)).toBeNull();
  });

  it("não ancora cancelamentos, planos nem perguntas", () => {
    expect(isEllipticCompletion("Cancela isso")).toBe(false);
    expect(isEllipticCompletion("Amanhã trato disso")).toBe(false);
    expect(isEllipticCompletion("Já está concluída?")).toBe(false);
  });

  it("golden 3 — a frase do 20/08 é reconhecida como afirmação de conclusão", () => {
    expect(claimsCompletion("Dei o lembrete da marcação das unhas como concluído.")).toBe(true);
    expect(claimsCompletion("Desmarquei a visita das 18h.")).toBe(false);
    expect(claimsCompletion("Registei a nota sobre o Nuno.")).toBe(false);
  });
});

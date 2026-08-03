import { describe, expect, it } from "vitest";
import { detectFeedbackIntent, feedbackConfirmQuestion } from "./feedback";

describe("feedback do produto", () => {
  it("apanha erro no Afonso", () => {
    expect(detectFeedbackIntent("encontrei um erro, o Afonso disse X quando devia dizer Y")).toBe("bug");
  });
  it("apanha sugestão", () => {
    expect(detectFeedbackIntent("sugestão: seria bom se o Afonso avisasse antes")).toBe("suggestion");
  });
  it("ignora queixa sobre cliente", () => {
    expect(detectFeedbackIntent("o proprietário falhou a visita e não funciona assim")).toBeNull();
    expect(detectFeedbackIntent("marca visita amanhã às 10h")).toBeNull();
  });
  it("pergunta antes de gravar", () => {
    expect(feedbackConfirmQuestion("bug")).toContain("registe isto como erro");
  });
});

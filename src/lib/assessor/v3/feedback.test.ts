import { describe, expect, it } from "vitest";
import { detectFeedbackIntent, detectFeedbackTarget, feedbackClarifyQuestion, feedbackConfirmQuestion, readClarifyAnswer, detectFeedbackAnnouncement, isEmptyFeedbackBody } from "./feedback";

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
    expect(feedbackConfirmQuestion("bug")).toContain("Guardo isto como erro em Erros, no dashboard");
  });
});

describe("clarificação produto vs. pessoa", () => {
  it("mensagem vaga pede clarificação em vez de assumir", () => {
    expect(detectFeedbackTarget("isto não funciona")).toEqual({ kind: "bug", target: "ambiguous" });
    expect(detectFeedbackIntent("isto não funciona")).toBeNull();
  });
  it("produto + pessoa na mesma frase é ambíguo", () => {
    expect(detectFeedbackTarget("o app não funciona com o proprietário")?.target).toBe("ambiguous");
  });
  it("produto claro continua direto à confirmação", () => {
    expect(detectFeedbackTarget("o Afonso não funciona")).toEqual({ kind: "bug", target: "product" });
  });
  it("frase sobre pessoa continua a não ser feedback", () => {
    expect(detectFeedbackTarget("o proprietário falhou a visita e não funciona assim")).toBeNull();
  });
  it("lê a resposta à clarificação", () => {
    expect(readClarifyAnswer("é da app")).toBe("product");
    expect(readClarifyAnswer("é do proprietário")).toBe("person");
    expect(readClarifyAnswer("talvez")).toBeNull();
  });
  it("pergunta de clarificação distingue os dois lados", () => {
    expect(feedbackClarifyQuestion("bug")).toContain("proprietário");
  });
});

describe("abertura de feedback em vários turnos", () => {
  it("apanha o anúncio sem corpo", () => {
    expect(detectFeedbackAnnouncement("Posso dar uma sugestão de melhoria?")).toBe("suggestion");
    expect(detectFeedbackAnnouncement("queria reportar um erro")).toBe("bug");
    expect(detectFeedbackAnnouncement("tenho uma ideia para o Afonso")).toBe("suggestion");
  });
  it("não confunde com nota sobre pessoa", () => {
    expect(detectFeedbackAnnouncement("quero registar um problema com o proprietário")).toBeNull();
    expect(detectFeedbackAnnouncement("marca visita amanhã às 10h")).toBeNull();
  });
  it("reconhece mensagens sem corpo", () => {
    expect(isEmptyFeedbackBody("sim, diz")).toBe(true);
    expect(isEmptyFeedbackBody("claro")).toBe(true);
    expect(isEmptyFeedbackBody("no Drive os ficheiros aparecem sem nome")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  emailFromText,
  emailSavedNote,
  missingEmailQuestion,
  outboundSendConfirmation,
  outboundSubject,
} from "./outbound-draft";
import { dropConfidential } from "@/lib/assessor/culture/confidential";

describe("email de iniciativa — regras invioláveis", () => {
  it("1. assunto nunca leva prefixo de resposta", () => {
    const s = outboundSubject({ propertyTitle: "T3 em Alvalade" });
    expect(s).toBe("Sobre T3 em Alvalade");
    expect(s.toLowerCase().startsWith("re:")).toBe(false);
  });

  it("2. o que o consultor dita ganha ao contexto", () => {
    expect(
      outboundSubject({ propertyTitle: "T3 em Alvalade", subjectHint: "Proposta de segunda" }),
    ).toBe("Proposta de segunda");
  });

  it("3. sem contexto há sempre assunto utilizável", () => {
    expect(outboundSubject({ consultantName: "Júlio Quintela" })).toBe("Contacto de Júlio Quintela");
    expect(outboundSubject({})).toBe("Contacto");
  });

  it("4. lê o endereço de uma frase falada, sem pontuação final", () => {
    expect(emailFromText("é ana.silva@exemplo.pt.")).toBe("ana.silva@exemplo.pt");
    expect(emailFromText("o email dele é NUNO@Mail.com, obrigado")).toBe("nuno@mail.com");
    expect(emailFromText("não sei qual é")).toBeNull();
    expect(emailFromText("arroba sem nada @")).toBeNull();
  });

  it("5. notas confidenciais nunca alimentam texto que sai para fora", () => {
    const rows = [
      { summary: "divórcio a correr", is_confidential: true },
      { summary: "quer visitar sábado", is_confidential: false },
    ];
    const kept = dropConfidential(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.summary).toBe("quer visitar sábado");
  });

  it("6. Outlook nunca é anunciado como enviado", () => {
    const outlook = outboundSendConfirmation({ toLabel: "ana@exemplo.pt", manualSend: true });
    expect(outlook).toMatch(/rascunho/i);
    expect(outlook).not.toMatch(/\bEnviado\b/);

    const gmail = outboundSendConfirmation({ toLabel: "ana@exemplo.pt", manualSend: false });
    expect(gmail).toMatch(/^Enviado para ana@exemplo\.pt/);
  });

  it("7. sem email na ficha pergunta-se, e confirma-se o que ficou guardado", () => {
    expect(missingEmailQuestion(" Ana ")).toBe(
      "Não tenho email do Ana. Qual é o endereço para eu preparar a mensagem?",
    );
    expect(emailSavedNote("Nuno")).toBe("Guardei o email na ficha do Nuno.");
  });
});

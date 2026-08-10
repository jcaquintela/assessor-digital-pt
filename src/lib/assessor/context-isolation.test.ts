import { describe, it, expect } from "vitest";
import {
  isPendingRelated,
  isolateUnrelatedPending,
  pendingContextText,
  stripInheritedMotive,
} from "./context-isolation";

const pendingCaderneta = {
  id: "pa1",
  intent: "create_follow_up",
  current_question: "Falta a caderneta predial no imóvel Moradia na Alameda da República. Peço ao proprietário?",
  structured_payload: { title: "Pedir caderneta predial ao proprietário", property: "Moradia na Alameda da República" },
};

describe("isolamento de contexto entre pendentes", () => {
  it("pedido novo sobre outra pessoa não é relacionado com o pendente", () => {
    const text = pendingContextText(pendingCaderneta);
    expect(isPendingRelated("Contacta o Nuno Castilho", text)).toBe(false);
  });

  it("resposta curta sem nomes continua ligada ao pendente", () => {
    const text = pendingContextText(pendingCaderneta);
    expect(isPendingRelated("sim", text)).toBe(true);
    expect(isPendingRelated("amanhã às 10", text)).toBe(true);
  });

  it("mensagem sobre o mesmo assunto continua relacionada", () => {
    const text = pendingContextText(pendingCaderneta);
    expect(isPendingRelated("A caderneta da Alameda já chegou", text)).toBe(true);
  });

  it("esconde o pendente não relacionado do DECIDE", () => {
    const { searches, isolated } = isolateUnrelatedPending(
      { pending_action: pendingCaderneta, conversation_state: { state_summary: "pedir caderneta", goal: "caderneta" } },
      "Contacta o Nuno Castilho",
    );
    expect(isolated).toBe(true);
    expect(searches.pending_action).toBeNull();
    expect(searches.conversation_state.state_summary).toBeNull();
  });

  it("golden: lembrete novo nunca herda o porquê do pendente anterior", () => {
    const text = pendingContextText(pendingCaderneta);
    const out = stripInheritedMotive(
      "Fica o lembrete para lhe ligares a pedir a caderneta predial.",
      { message: "Contacta o Nuno Castilho", pendingText: text },
    );
    expect(out.toLowerCase()).not.toContain("caderneta");
    expect(out).toBe("Fica o lembrete para lhe ligares.");
  });

  it("golden: motivo escrito pelo consultor mantém-se intacto", () => {
    const text = pendingContextText(pendingCaderneta);
    const msg = "Contacta o Nuno Castilho para combinar a visita";
    expect(stripInheritedMotive("Lembrete: ligar ao Nuno Castilho para combinar a visita.", { message: msg, pendingText: text }))
      .toBe("Lembrete: ligar ao Nuno Castilho para combinar a visita.");
  });

  it("título do lembrete fica genérico quando não há motivo próprio", () => {
    const text = pendingContextText(pendingCaderneta);
    expect(stripInheritedMotive("Ligar ao Nuno Castilho a pedir a caderneta predial", { message: "Contacta o Nuno Castilho", pendingText: text }))
      .toBe("Ligar ao Nuno Castilho");
  });
});
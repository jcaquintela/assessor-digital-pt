import { describe, it, expect } from "vitest";
import {
  buildWriteConfirmation,
  claimsDelivery,
  enforceWriteConfirmation,
  isBareAck,
} from "./confirmations";
import { isDiscardCommand, DISCARD_DONE_REPLY } from "./discard";
import { feedbackSavedReply, FEEDBACK_ATTACHMENT_ADDED_REPLY } from "../v3/feedback";
import { enforceTransparentConfirmation } from "../v3/write-receipt";

describe("comando descartar", () => {
  it.each(["Descartar", "descarta", "descarta tudo", "Apaga isso", "Esquece.", "não guardes nada"])(
    "reconhece: %s",
    (t) => expect(isDiscardCommand(t)).toBe(true),
  );

  it.each([
    "Apaga o seguimento do Nuno Castilho",
    "descarta a proposta do Sr. Coelho mas guarda o resto",
    "sim",
  ])("não confunde com outra coisa: %s", (t) => expect(isDiscardCommand(t)).toBe(false));

  it("resposta é sempre a mesma e não promete guardar nada", () => {
    expect(DISCARD_DONE_REPLY).toBe("Descartado. Nada foi guardado.");
    expect(DISCARD_DONE_REPLY).not.toMatch(/fica guardado/i);
  });
});

describe("vocabulário controlado nas confirmações", () => {
  it("template diz o quê e onde", () => {
    expect(
      buildWriteConfirmation({
        object: "a sugestão",
        title: "botão de exportar",
        destination: "Sugestões, no dashboard",
      }),
    ).toBe('Guardei a sugestão "botão de exportar" em Sugestões, no dashboard. Não enviei nada a ninguém.');
  });

  it.each([
    "Obrigado, registei. A equipa vai olhar para isto.",
    "Enviei para a equipa.",
    "Já partilhei isso.",
  ])("deteta promessa de envio: %s", (t) => expect(claimsDelivery(t)).toBe(true));

  it("a negação explícita não conta como promessa", () => {
    expect(claimsDelivery("Guardei a sugestão em Sugestões. Não enviei nada a ninguém.")).toBe(false);
  });

  it.each(["Feito.", "Ok", "Pronto!", "Registado."])("apanha confirmação opaca: %s", (t) =>
    expect(isBareAck(t)).toBe(true),
  );

  it("substitui 'Feito.' pelo recibo completo", () => {
    const out = enforceWriteConfirmation("Feito.", {
      object: "o seguimento",
      title: "Ligar ao Nuno",
      destination: "Seguimentos",
    });
    expect(out).toContain("Guardei o seguimento");
    expect(out).toContain("Seguimentos");
  });
});

describe("feedback do produto", () => {
  it("confirmação não promete envio à equipa", () => {
    const r = feedbackSavedReply("suggestion", { title: "juntar filtro por zona" });
    expect(claimsDelivery(r)).toBe(false);
    expect(r).toContain("Sugestões, no dashboard");
    expect(r).toContain("Não enviei nada a ninguém");
  });

  it("erro com anexo diz que o anexo entrou", () => {
    const r = feedbackSavedReply("bug", { title: "ecrã em branco", withAttachment: true });
    expect(r).toContain("Erros, no dashboard");
    expect(r).toContain("Anexo incluído.");
  });

  it("a pergunta de anexo já não fala em equipa", () => {
    expect(claimsDelivery(FEEDBACK_ATTACHMENT_ADDED_REPLY)).toBe(false);
  });
});

describe("recibo final do motor", () => {
  const tools = [
    { name: "create_follow_up", ok: true, data: { follow_up: { id: "1", title: "Ligar ao Nuno" } } },
  ];

  it("'Feito.' vira recibo verificável", () => {
    const out = enforceTransparentConfirmation("Feito.", tools, { executedOk: true });
    expect(out).toBe('Guardei o seguimento "Ligar ao Nuno" em Seguimentos.');
  });

  it("promessa de envio é substituída pelo que realmente aconteceu", () => {
    const out = enforceTransparentConfirmation("Enviei para a equipa.", tools, { executedOk: true });
    expect(claimsDelivery(out)).toBe(false);
    expect(out).toContain("Seguimentos");
  });

  it("uma resposta já boa não é mexida", () => {
    const good = 'Guardei o seguimento "Ligar ao Nuno" em Seguimentos.';
    expect(enforceTransparentConfirmation(good, tools, { executedOk: true })).toBe(good);
  });
});
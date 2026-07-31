import { describe, expect, it } from "vitest";
import {
  decodeInteractiveId,
  deriveInteractivePrompt,
  encodeInteractiveId,
  resolveInteractiveReply,
} from "./interactive";

describe("interactive", () => {
  it("codifica e descodifica o texto canónico no id", () => {
    const id = encodeInteractiveId("não");
    expect(decodeInteractiveId(id)).toBe("não");
    expect(decodeInteractiveId("outro_id")).toBeNull();
  });

  it("o id manda sobre o rótulo escrito", () => {
    expect(resolveInteractiveReply(encodeInteractiveId("não"), "Ainda não")).toBe("não");
    expect(resolveInteractiveReply("legacy", "Ainda não")).toBe("Ainda não");
  });

  it("confirmação de rascunho vira dois botões", () => {
    const p = deriveInteractivePrompt("Registo *Casa 2* com o *918 579 839*. Confirmas?", {
      hasPendingConfirmation: true,
    });
    expect(p?.kind).toBe("buttons");
    expect(p?.options.map((o) => o.label)).toEqual(["Sim", "Ainda não"]);
    expect(decodeInteractiveId(p!.options[1].id)).toBe("não");
  });

  it("sem rascunho pendente e sem opções, fica texto simples", () => {
    expect(deriveInteractivePrompt("A que horas?", { hasPendingConfirmation: false })).toBeNull();
    expect(deriveInteractivePrompt("Feito.", { hasPendingConfirmation: true })).toBeNull();
  });

  it("mais de 3 opções viram List Message", () => {
    const reply = "Qual delas?\n- Ana Silva\n- Ana Sousa\n- Ana Costa\n- Ana Dias";
    const p = deriveInteractivePrompt(reply, { hasPendingConfirmation: false });
    expect(p?.kind).toBe("list");
    expect(p?.options).toHaveLength(4);
  });

  it("2 a 3 opções de escolha viram botões", () => {
    const reply = "Qual delas?\n- *Ana Silva*\n- *Ana Sousa*";
    const p = deriveInteractivePrompt(reply, { hasPendingConfirmation: false });
    expect(p?.kind).toBe("buttons");
    expect(decodeInteractiveId(p!.options[0].id)).toBe("Ana Silva");
  });
});

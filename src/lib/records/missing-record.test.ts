import { describe, it, expect } from "vitest";
import { classifyMissingRecord, missingRecordCopy } from "./missing-record";

describe("registo em falta", () => {
  // Golden 1: existe, mas a sessão é de outra conta (caso da Iolanda).
  it("distingue sessão errada de dados perdidos e oferece mudar de conta", () => {
    const kind = classifyMissingRecord({ existsForOtherUser: true, archivedForMe: false });
    expect(kind).toBe("other_account");
    const copy = missingRecordCopy(kind, { label: "seguimento", sessionEmail: "ventura.iolanda@gmail.com" });
    expect(copy.title).toBe("Este seguimento está noutra conta");
    expect(copy.subtitle).toContain("ventura.iolanda@gmail.com");
    expect(copy.subtitle).toContain("Nada foi perdido");
    expect(copy.subtitle).not.toContain("apagado");
    expect(copy.showSwitchAccount).toBe(true);
  });

  // Golden 2: genuinamente inexistente → mensagem de hoje mantém-se.
  it("mantém a mensagem atual quando o registo não existe mesmo", () => {
    const kind = classifyMissingRecord({ existsForOtherUser: false, archivedForMe: false });
    expect(kind).toBe("absent");
    const copy = missingRecordCopy(kind, { label: "seguimento", sessionEmail: "a@b.pt" });
    expect(copy.title).toBe("Seguimento não encontrado");
    expect(copy.subtitle).toBe("Pode ter sido apagado.");
    expect(copy.showSwitchAccount).toBe(false);
  });

  it("arquivado nesta conta não é tratado como conta errada", () => {
    const kind = classifyMissingRecord({ existsForOtherUser: true, archivedForMe: true });
    expect(kind).toBe("archived");
    expect(missingRecordCopy(kind, { label: "imóvel" }).showSwitchAccount).toBe(false);
  });

  it("sem email da sessão a frase continua legível", () => {
    const copy = missingRecordCopy("other_account", { label: "negócio", sessionEmail: null });
    expect(copy.subtitle).toContain("outra conta");
  });
});

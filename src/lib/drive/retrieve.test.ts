import { describe, it, expect } from "vitest";
import { detectDocumentRequest, parseChoice } from "./retrieve";

describe("recuperador do drive", () => {
  it("percebe pedido de documento com imóvel", () => {
    const r = detectDocumentRequest("manda-me a Caderneta Predial do T2 de Benfica");
    expect(r?.kind).toBe("send");
    if (r?.kind === "send") {
      expect(r.docType).toBe("caderneta");
      expect(r.subject).toContain("benfica");
    }
  });

  it("percebe pedido por tipo sem assunto", () => {
    const r = detectDocumentRequest("preciso do CPU");
    expect(r?.kind).toBe("send");
    if (r?.kind === "send") expect(r.docType).toBe("cpu");
  });

  it("percebe listagem por pessoa", () => {
    const r = detectDocumentRequest("que documentos tenho da Sra. Ana?");
    expect(r?.kind).toBe("list");
    if (r?.kind === "list") expect(r.subject).toBe("ana");
  });

  it("ignora conversa normal", () => {
    expect(detectDocumentRequest("bom dia, tudo bem?")).toBeNull();
    expect(detectDocumentRequest("marca visita amanhã às 15h com o João")).toBeNull();
  });

  it("lê a escolha de um número", () => {
    expect(parseChoice("o 2", 3)).toBe(1);
    expect(parseChoice("o primeiro", 3)).toBe(0);
    expect(parseChoice("não é nenhum", 3)).toBeNull();
  });
});

import { encodeDocCommand, parseDocCommand, docOptionLabel, shortDocId } from "./retrieve";

describe("escolha do documento", () => {
  const id = "502cbf2f-4551-4e43-9e37-5d344f086d40";

  it("codifica e lê a escolha por toque", () => {
    const cmd = encodeDocCommand(id);
    expect(parseDocCommand(cmd)).toBe(shortDocId(id));
    expect(parseDocCommand("bom dia")).toBeNull();
  });

  it("cabe no limite de um botão", () => {
    expect(encodeDocCommand(id).length).toBeLessThanOrEqual(24);
  });

  it("mostra nomes legíveis", () => {
    expect(docOptionLabel("CPU_Consortes.pdf")).toBe("CPU Consortes");
    expect(docOptionLabel("CertidaoPermanente-PA-2880-34210-131216.pdf").length).toBeLessThanOrEqual(24);
  });
});

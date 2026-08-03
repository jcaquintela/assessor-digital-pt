import { describe, it, expect } from "vitest";
import { detectDocumentRequest, detectDocMetaQuery } from "@/lib/drive/retrieve";

describe("NIF", () => {
  it("apanha pedido por NIF", () => {
    expect(detectDocumentRequest("NIF 221498605 documento com este NIF")).toEqual({ kind: "meta", nif: "221498605", artigo: null });
    expect(detectDocMetaQuery("tens algum documento com o nif 221498605?")?.nif).toBe("221498605");
    expect(detectDocMetaQuery("procura o documento do artigo matricial 1234")?.artigo).toBe("1234");
  });
  it("não rouba conversa normal", () => {
    expect(detectDocMetaQuery("liga à Ana amanhã")).toBeNull();
    expect(detectDocMetaQuery("o telemóvel dela é 912345678")).toBeNull();
  });
});

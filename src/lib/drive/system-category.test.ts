import { describe, it, expect } from "vitest";
import { systemCategoryFor, systemCategoryLabel } from "./system-category";

describe("systemCategoryFor", () => {
  it("áudio vai sempre para notas de voz", () => {
    expect(systemCategoryFor({ classification: "audio", mime_type: "audio/ogg" })).toBe("notas_voz");
    expect(systemCategoryFor({ mime_type: "audio/mpeg" })).toBe("notas_voz");
  });
  it("placa de venda vai para prospeção", () => {
    expect(systemCategoryFor({ classification: "prospecao", mime_type: "image/jpeg" })).toBe("prospecao");
    expect(systemCategoryFor({ classification: "imagem", document_type: "Placa Vende-se" })).toBe("prospecao");
  });
  it("cartão de visita tem categoria própria", () => {
    expect(systemCategoryFor({ classification: "imagem", document_type: "Cartão de visita" })).toBe("contactos");
  });
  it("documentos lidos e PDFs", () => {
    expect(systemCategoryFor({ classification: "imagem", document_type: "Caderneta Predial" })).toBe("documentos");
    expect(systemCategoryFor({ classification: "documento_pdf", mime_type: "application/pdf" })).toBe("documentos");
  });
  it("fotos, folhas e notas", () => {
    expect(systemCategoryFor({ classification: "imagem", mime_type: "image/jpeg" })).toBe("fotos");
    expect(systemCategoryFor({ classification: "planilha" })).toBe("folhas");
    expect(systemCategoryFor({ classification: "texto" })).toBe("notas");
  });
  it("nunca fica por categorizar", () => {
    expect(systemCategoryFor({})).toBe("outros");
    expect(systemCategoryLabel(systemCategoryFor({}))).toBe("Outros");
  });
});

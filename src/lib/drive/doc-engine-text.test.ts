import { describe, expect, it } from "vitest";
import { docLinkText, documentToEngineText } from "./doc-engine-text";

describe("documentToEngineText", () => {
  it("identifica uma caderneta predial", () => {
    const t = documentToEngineText({
      doc_type: "Caderneta Predial",
      artigo_matricial: "1234",
      morada: "Rua das Flores 12, Gaia",
      expires_on: "2026-12-31",
    });
    expect(t).toContain("Caderneta Predial");
    expect(t).toContain("artigo matricial 1234");
    expect(t).toContain("31/12/2026");
  });

  it("devolve null sem dados", () => {
    expect(documentToEngineText({})).toBeNull();
  });

  it("junta a legenda do consultor", () => {
    const t = documentToEngineText({ doc_type: "Certidão Permanente" }, "é do imóvel da Ana");
    expect(t).toContain("é do imóvel da Ana");
  });

  it("docLinkText junta morada e texto lido", () => {
    expect(docLinkText({ morada: "Rua A", visible_text: "texto" })).toBe("Rua A\ntexto");
    expect(docLinkText({})).toBeNull();
  });
});

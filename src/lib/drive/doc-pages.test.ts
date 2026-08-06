import { describe, expect, it } from "vitest";
import { isContinuationReading, isSameDocument, mergeReadings, pageJoinedText } from "./doc-pages";

describe("doc-pages", () => {
  it("junta página sem identificadores ao documento anterior", () => {
    const p1 = { doc_type: "Caderneta predial", artigo_matricial: "1234", morada: "Rua das Flores 10" };
    const p2 = { visible_text: "continuação do quadro de avaliação" };
    expect(isContinuationReading(p2)).toBe(true);
    expect(isSameDocument(p1, p2)).toBe(true);
  });

  it("não junta documentos com artigo matricial diferente", () => {
    expect(
      isSameDocument({ artigo_matricial: "1234" }, { artigo_matricial: "9999", doc_type: "Caderneta predial" }),
    ).toBe(false);
  });

  it("junta quando partilham NIF ou morada", () => {
    expect(isSameDocument({ nif: "501 234 567" }, { nif: "501234567" })).toBe(true);
    expect(isSameDocument({ morada: "Rua A, 1" }, { morada: "rua a,  1" })).toBe(true);
  });

  it("consolida leituras mantendo o primeiro valor conhecido", () => {
    const merged = mergeReadings([
      { doc_type: "Caderneta predial", artigo_matricial: "1234", visible_text: "página 1" },
      { morada: "Rua das Flores 10", expires_on: "2027-01-31", visible_text: "página 2" },
    ]);
    expect(merged.doc_type).toBe("Caderneta predial");
    expect(merged.artigo_matricial).toBe("1234");
    expect(merged.morada).toBe("Rua das Flores 10");
    expect(merged.expires_on).toBe("2027-01-31");
    expect(merged.visible_text).toBe("página 1\n\npágina 2");
  });

  it("frase de página inclui o registo ligado", () => {
    expect(pageJoinedText(2, "Caderneta predial", "Rua das Flores 10")).toContain("Página 2");
    expect(pageJoinedText(2, "Caderneta predial", "Rua das Flores 10")).toContain("Rua das Flores 10");
  });
});
import { describe, it, expect } from "vitest";
import { isIllegibleName, suggestDocumentName, expiryAlert } from "./doc-meta";

describe("isIllegibleName", () => {
  it("apanha nomes de scanner e câmara", () => {
    for (const n of ["SCAN_20260803_0012.pdf", "IMG_2043.jpg", "documento (1).pdf", "20260803.pdf", "WhatsApp Image 2026", ""])
      expect(isIllegibleName(n)).toBe(true);
  });
  it("respeita nomes reais", () => {
    for (const n of ["Caderneta Rua das Flores.pdf", "CPCV Silva.pdf", "Mensagem de voz 03 ago 10h12"])
      expect(isIllegibleName(n)).toBe(false);
  });
});

describe("suggestDocumentName", () => {
  it("usa a sugestão do modelo", () => {
    expect(suggestDocumentName({ title_hint: "Caderneta Predial - Moradia Gaia" })).toBe(
      "Caderneta Predial - Moradia Gaia",
    );
  });
  it("compõe tipo + morada", () => {
    expect(suggestDocumentName({ doc_type: "Certidão Permanente", morada: "Rua das Flores 12, Gaia" })).toBe(
      "Certidão Permanente - Rua das Flores 12",
    );
  });
  it("sem dados devolve null", () => {
    expect(suggestDocumentName({})).toBeNull();
  });
});

describe("expiryAlert", () => {
  const hoje = new Date("2026-08-03T12:00:00Z");
  it("sinaliza validade próxima", () => {
    expect(expiryAlert({ doc_expires_on: "2026-08-13" }, hoje)?.level).toBe("urgente");
    expect(expiryAlert({ doc_expires_on: "2026-09-10" }, hoje)?.level).toBe("aviso");
    expect(expiryAlert({ doc_expires_on: "2026-07-01" }, hoje)?.level).toBe("expirado");
    expect(expiryAlert({ doc_expires_on: "2027-08-13" }, hoje)).toBeNull();
  });
  it("certidão permanente com mais de 6 meses", () => {
    const f = { doc_issued_on: "2026-01-02", document_type: "Certidão Permanente" };
    expect(expiryAlert(f, hoje)?.level).toBe("expirado");
    expect(expiryAlert({ ...f, doc_issued_on: "2026-02-20" }, hoje)?.level).toBe("aviso");
  });
  it("sem datas não inventa alertas", () => {
    expect(expiryAlert({ original_file_name: "foto.jpg" }, hoje)).toBeNull();
  });
});

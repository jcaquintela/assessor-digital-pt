import { describe, it, expect } from "vitest";
import { pdfLikelyHasTextLayer } from "./doc-extract.server";

const enc = (s: string) => new TextEncoder().encode(s);

describe("pdfLikelyHasTextLayer", () => {
  it("deteta PDF com texto real", () => {
    expect(pdfLikelyHasTextLayer(enc("%PDF-1.4 /Font /BaseFont /Helvetica BT (Ola) Tj ET"))).toBe(true);
  });
  it("deteta PDF-scan do WhatsApp (só imagens)", () => {
    expect(pdfLikelyHasTextLayer(enc("%PDF-1.4 /XObject /Image /DCTDecode stream binary"))).toBe(false);
  });
});

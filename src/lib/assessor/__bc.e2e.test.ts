import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readImage } from "@/lib/ai/vision.server";
import { extractBusinessCard, buildContactVCard } from "./business-card.server";

describe("cartão de visita", () => {
  it("lê e extrai contacto", async () => {
    const bytes = new Uint8Array(readFileSync("/mnt/documents/cartao-teste.jpg"));
    const v = await readImage(bytes, "image/jpeg");
    console.log("READING", JSON.stringify((v as any).reading ?? v, null, 2));
    expect(v.ok).toBe(true);
    const card = extractBusinessCard((v as any).reading);
    console.log("CARD", card);
    expect(card?.name).toContain("Ricardo");
    console.log("VCF", buildContactVCard(card!).content);
  }, 90000);
});

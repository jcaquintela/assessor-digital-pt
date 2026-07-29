// Só servidor: node:crypto não pode entrar no bundle do browser.
import { createHash, randomInt } from "crypto";

export function hashLinkCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function generateLinkCode(): string {
  const n = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return `LIGAR-${n}`;
}
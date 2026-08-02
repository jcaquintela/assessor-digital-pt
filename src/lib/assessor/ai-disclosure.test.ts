// Rede de segurança do Art. 50 do AI Act: nenhuma porta de entrada pode
// ficar sem o aviso de IA no primeiro parágrafo — nem para contas novas.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { AI_DISCLOSURE, aiDisclosureOpening, withAiDisclosure } from "./ai-disclosure";

const FIRST_CONTACT_TEXTS: Array<[file: string, constName: string]> = [
  ["src/lib/assessor/channel-gateway/telegram-adapter.ts", "REPLY_ONBOARDING"],
  ["src/lib/assessor/channel-gateway/telegram-adapter.ts", "INTRO_2_LINHAS"],
  ["src/lib/telegram/pairing.server.ts", "ASK_WHATSAPP"],
  ["src/lib/assessor/channel-gateway/whatsapp-adapter.ts", "REPLY_UNASSOCIATED"],
  ["src/lib/assessor/channel-gateway/whatsapp-adapter.ts", "REPLY_PROMO_WELCOME"],
];

function firstParagraphOf(file: string, name: string): string {
  const src = readFileSync(file, "utf8");
  const start = src.indexOf(`const ${name}`);
  expect(start, `${name} não existe em ${file}`).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("\n\n", start) === -1 ? undefined : src.indexOf(";\n", start));
  // Até ao primeiro corte de parágrafo (\n\n) declarado no literal.
  const cut = body.indexOf("\\n\\n");
  return cut === -1 ? body : body.slice(0, cut);
}

describe("disclosure de IA", () => {
  it("abre com a frase, com e sem nome", () => {
    expect(aiDisclosureOpening("Júlio")).toBe(`Olá Júlio! ${AI_DISCLOSURE}`);
    expect(aiDisclosureOpening()).toBe(`Olá! ${AI_DISCLOSURE}`);
    expect(withAiDisclosure("Texto.")).toStartWith?.call(null) ?? null;
    expect(withAiDisclosure("Texto.")).toBe(`${AI_DISCLOSURE} Texto.`);
    expect(withAiDisclosure(`Já tem. ${AI_DISCLOSURE}`)).toBe(`Já tem. ${AI_DISCLOSURE}`);
  });

  it.each(FIRST_CONTACT_TEXTS)("%s → %s tem o aviso no primeiro parágrafo", (file, name) => {
    const p = firstParagraphOf(file, name);
    const hasIt =
      p.includes("aiDisclosureOpening") ||
      p.includes("AI_DISCLOSURE") ||
      p.includes("assistente de IA");
    expect(hasIt, `${name} em ${file} não abre com o aviso de IA`).toBe(true);
  });

  it("o onboarding do dashboard também avisa", () => {
    const src = readFileSync("src/routes/_authenticated/assessor.tsx", "utf8");
    expect(src).toContain("Assistente de IA");
    expect(src).toContain("assistente de IA");
  });
});
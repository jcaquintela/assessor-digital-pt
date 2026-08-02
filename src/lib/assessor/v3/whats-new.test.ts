import { describe, expect, it } from "vitest";
import { detectWhatsNewQuery, formatWhatsNewReply, NO_UPDATES_REPLY } from "./whats-new";

describe("novidades", () => {
  it("deteta perguntas de novidades", () => {
    expect(detectWhatsNewQuery("o que há de novo?")).toBe(true);
    expect(detectWhatsNewQuery("tiveste atualizações?")).toBe(true);
    expect(detectWhatsNewQuery("que novidades tens?")).toBe(true);
    expect(detectWhatsNewQuery("o que mudou por aí?")).toBe(true);
  });

  it("não confunde com competências nem com agenda", () => {
    expect(detectWhatsNewQuery("o que sabes fazer?")).toBe(false);
    expect(detectWhatsNewQuery("quais são as tuas competências?")).toBe(false);
    expect(detectWhatsNewQuery("o que tenho hoje?")).toBe(false);
  });

  it("resume as mais recentes primeiro e limita a lista", () => {
    const ups = Array.from({ length: 7 }, (_, i) => ({
      released_on: i === 0 ? "2026-08-02" : "2026-07-01",
      title: `T${i}`,
      description: "Descrição normal.",
      category: i === 0 ? "melhoria" : "nova_funcionalidade",
    }));
    const reply = formatWhatsNewReply(ups);
    expect(reply).toContain("*T0*");
    expect(reply).toContain("E mais 2 melhorias");
    expect(reply).not.toMatch(/tabela|payload|id\b/i);
  });

  it("sem novidades responde de forma natural", () => {
    expect(formatWhatsNewReply([])).toBe(NO_UPDATES_REPLY);
  });
});
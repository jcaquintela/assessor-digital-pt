import { describe, it, expect } from "vitest";
import { detectPersonBriefQuery, formatPersonBrief, personNotFoundReply } from "./person-brief";
import { detectAgendaQuery } from "./deterministic.server";

describe("detectPersonBriefQuery", () => {
  it("apanha as formulações naturais", () => {
    expect(detectPersonBriefQuery("o que tenho sobre a Marta Santana")).toBe("Marta Santana");
    expect(detectPersonBriefQuery("resume-me a Marta antes da reunião")).toBe("Marta");
    expect(detectPersonBriefQuery("o que sei da Marta?")).toBe("Marta");
    expect(detectPersonBriefQuery("fala-me do João Paulo")).toBe("João Paulo");
    expect(detectPersonBriefQuery("resumo da Marta Santana")).toBe("Marta Santana");
  });
  it("não rouba pedidos de agenda nem de placas", () => {
    expect(detectPersonBriefQuery("o que tenho hoje?")).toBeNull();
    expect(detectPersonBriefQuery("lista as placas")).toBeNull();
    expect(detectPersonBriefQuery("o que tenho sobre imóveis")).toBeNull();
    expect(detectAgendaQuery("o que tenho sobre a Marta Santana")).toBeNull();
  });
});

describe("formatPersonBrief", () => {
  it("resume tudo numa mensagem só", () => {
    const out = formatPersonBrief({
      name: "Marta Santana",
      relationship: "proprietario",
      phone: "351934111222",
      lastInteraction: { when: "2026-07-28T10:00:00Z", text: "Quer vender até setembro." },
      properties: [{ title: "T3 na Feira", status: "angariado", price: 245000 }],
      deals: [{ label: "Venda", value: 245000, status: "em negociação" }],
      nextAction: { text: "Enviar CPCV", when: "2026-08-03T09:00:00Z" },
    });
    expect(out).toContain("*Marta Santana*");
    expect(out).toContain("Última nota (28/07/2026): Quer vender até setembro.");
    expect(out).toContain("T3 na Feira");
    expect(out).toContain("angariado");
    expect(out).toContain("Negócio: Venda");
    expect(out).toContain("Próxima ação (03/08/2026): Enviar CPCV");
    expect(out).toContain("934 111 222");
    expect(out.split("\n").length).toBeLessThanOrEqual(8);
  });
  it("diz claramente quando não há nada", () => {
    const out = formatPersonBrief({ name: "Rui", properties: [], deals: [] });
    expect(out).toContain("Ainda não tenho nada registado");
    expect(out).not.toMatch(/não percebi/i);
    expect(personNotFoundReply("Zé")).toContain("Não encontrei ninguém");
  });
});

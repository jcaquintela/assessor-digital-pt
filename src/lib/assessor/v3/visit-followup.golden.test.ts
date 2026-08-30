// Golden tests — Follow-up instantâneo pós-visita.
//
// O que estes testes protegem:
// 1. Visita rica → recibo + rascunho em bolha própria + comparáveis.
// 2. Visita pobre ("correu bem") → registo + pergunta, nunca rascunho genérico.
// 3. Zona de comparação → comparáveis saem na 3.ª bolha.
// 4. Nota confidencial da pessoa NUNCA entra no contexto do rascunho.
// 5. Ambiguidade de pessoa sobe à confirmação única — mecanismo já existente.

import { describe, it, expect } from "vitest";
import {
  coerceThemes,
  emptyLinks,
  formatThemesProposal,
  pendingAmbiguities,
  type AudioTheme,
} from "./audio-themes";
import { composeVisitReply, VISIT_ASK_QUESTION, visitHasSubstance, visitReceiptLine } from "./visit-followup";
import { splitSuggestedMessage } from "../culture/suggested-message";
import { buildPersonBrief } from "./person-brief.server";
import { briefContextLines } from "@/lib/email/outbound-draft.server";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

function theme(raw: Partial<any>): AudioTheme {
  return coerceThemes({ themes: [{ kind: "visit", title: "Visita", ...raw }] })[0]!;
}

const RICH = theme({
  title: "Visita ao T3 com o Carlos",
  person: { name: "Carlos Mendes", role: "comprador" },
  property: { typology: "T3", location: "Canidelo" },
  visit: {
    reaction: "Gostou muito da cozinha e da luz da sala",
    objection: "Achou o preço acima do que esperava",
    comparison_zone: "Gaia",
  },
});

describe("visita rica", () => {
  it("1) devolve três bolhas: recibo, rascunho e comparáveis", () => {
    expect(visitHasSubstance(RICH)).toBe(true);
    const reply = composeVisitReply({
      base: "Guardei o contacto Carlos Mendes em Negócios, no dashboard.",
      receipt: visitReceiptLine(RICH, "Carlos Mendes"),
      draft: "Olá Carlos, obrigado pelo tempo de hoje. Fico a aguardar.",
      comparables: "Anúncios publicados, não é avaliação:\n- T3 em Gaia",
    });
    const split = splitSuggestedMessage(reply);
    expect(split).not.toBeNull();
    expect(split!.intro).toContain("Registei a visita com Carlos Mendes");
    expect(split!.suggestion).toBe("Olá Carlos, obrigado pelo tempo de hoje. Fico a aguardar.");
    expect(split!.question).toContain("T3 em Gaia");
  });
});

describe("visita pobre", () => {
  it("2) só regista e pergunta — sem rascunho genérico", () => {
    const poor = theme({
      title: "Visita ao apartamento",
      person: { name: "Rita Sousa" },
      visit: { reaction: "correu bem" },
    });
    expect(visitHasSubstance(poor)).toBe(false);
    const reply = composeVisitReply({
      base: "Guardei a visita.",
      receipt: visitReceiptLine(poor, "Rita Sousa"),
      draft: null,
      ask: true,
    });
    expect(reply).toContain(VISIT_ASK_QUESTION);
    expect(splitSuggestedMessage(reply)).toBeNull();
    expect(reply).not.toMatch(/Olá Rita/);
  });
});

describe("comparáveis", () => {
  it("3) a zona de comparação é extraída e sai na terceira bolha", () => {
    expect(RICH.visit?.comparison_zone).toBe("Gaia");
    const reply = composeVisitReply({
      base: "Guardei.",
      receipt: visitReceiptLine(RICH, "Carlos Mendes"),
      draft: "Olá Carlos, ficou alguma dúvida sobre o valor?",
      comparables: "Anúncios publicados, não é avaliação:\n- T3 em Gaia — 320.000 €",
    });
    const split = splitSuggestedMessage(reply)!;
    expect(split.question).toContain("320.000 €");
    // O rascunho não pode ficar contaminado com o bloco de comparáveis.
    expect(split.suggestion).not.toContain("Anúncios publicados");
  });
});

describe("confidencialidade", () => {
  it("4) nota confidencial da pessoa nunca entra no contexto do rascunho", async () => {
    const supabase = makeFakeSupabase({
      people: [{ id: "p1", user_id: "u1", name: "Carlos Mendes", name_norm: "carlos mendes" }],
      interactions: [
        {
          id: "i1", user_id: "u1", person_id: "p1", is_confidential: true,
          summary: "Está em divórcio e precisa de vender depressa",
          occurred_at: "2026-08-30T10:00:00Z",
        },
        {
          id: "i2", user_id: "u1", person_id: "p1", is_confidential: false,
          summary: "Visitou o T3 de Canidelo",
          occurred_at: "2026-08-29T10:00:00Z",
        },
      ],
      properties: [], opportunities: [], follow_ups: [],
    });
    const look = await buildPersonBrief(
      { supabase, userId: "u1", channel: "whatsapp" } as never,
      "Carlos Mendes",
      { outward: true, personId: "p1" },
    );
    expect(look.kind).toBe("ok");
    const lines = briefContextLines((look as any).brief).join("\n");
    expect(lines).not.toContain("divórcio");
    expect(lines).toContain("Visitou o T3");
  });
});

describe("ambiguidade", () => {
  it("5) pessoa ambígua na visita sobe à confirmação única do áudio", () => {
    const links = [{
      ...emptyLinks(),
      ambiguous_people: [
        { id: "a", label: "Carlos Mendes", score: 0.7 },
        { id: "b", label: "Carlos Meneses", score: 0.68 },
      ],
    }];
    const amb = pendingAmbiguities([RICH], links);
    expect(amb).toHaveLength(1);
    const proposal = formatThemesProposal([RICH], links);
    expect(proposal).toContain("Carlos Mendes");
    expect(proposal).toContain("Qual deles é?");
    // Enquanto houver dúvida, não se pede confirmação cega nem se grava nada.
    expect(proposal).not.toContain("Confirmas?");
  });
});

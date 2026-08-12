import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  budgetHistoryPreview,
  budgetSearchResults,
  budgetDynamicContext,
  DYNAMIC_BUDGET_TOKENS,
} from "./context-budget";

function longConversation(turns: number): string {
  const lines: string[] = [];
  for (let i = 1; i <= turns; i++) {
    lines.push(`consultor: turno ${i} — ${"detalhe da conversa ".repeat(20)}`);
    lines.push(`assessor: resposta ${i} — ${"contexto adicional ".repeat(20)}`);
  }
  return lines.join("\n");
}

describe("orçamento de contexto v3", () => {
  // Golden 1 — conversa longa (20+ turnos) fica muito abaixo do contexto de hoje.
  it("corta uma conversa de 20 turnos sem perder o turno mais recente", () => {
    const raw = longConversation(20);
    const before = estimateTokens(raw);
    const after = budgetHistoryPreview(raw);
    expect(before).toBeGreaterThan(2000);
    expect(estimateTokens(after)).toBeLessThan(before / 2);
    expect(after.split("\n").at(-1)).toContain("resposta 20");
  });

  // Golden 2 — réplicas das 6 falhas: carga dinâmica sempre abaixo do orçamento.
  it.each([7788, 7469, 7410, 7198, 7056, 6817])(
    "réplica de turno com ~%i tokens fica dentro do orçamento dinâmico",
    (tokens) => {
      const filler = "x".repeat(Math.floor(tokens * 3.6));
      const out = budgetDynamicContext({
        historyPreview: `consultor: ${filler}\nassessor: ok`,
        searches: { people: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, name: filler.slice(0, 500) })) },
      });
      expect(out.estimatedTokens).toBeLessThanOrEqual(DYNAMIC_BUDGET_TOKENS);
    },
  );

  // Golden 3 — memória estruturada nunca é comprimida nem descartada.
  it("preserva conversation_state e pending_action intactos", () => {
    const state = {
      last_property: { id: "imo-1", title: "T3 na Foz com vista de mar", note: "y".repeat(2000) },
      last_person: { id: "p-1", name: "Iolanda Ventura" },
    };
    const pending = { id: "pa-1", kind: "criar_visita", payload: { property_id: "imo-1" } };
    const out = budgetDynamicContext({
      historyPreview: longConversation(30),
      searches: { conversation_state: state, pending_action: pending, properties: [] },
    });
    expect(out.searches.conversation_state).toEqual(state);
    expect(out.searches.pending_action).toEqual(pending);
  });

  it("remove listas vazias e limita listas grandes", () => {
    const out = budgetSearchResults({
      people: Array.from({ length: 30 }, (_, i) => ({ id: i })),
      properties: [],
      agenda: null,
    });
    expect((out.people as unknown[]).length).toBe(5);
    expect(out).not.toHaveProperty("properties");
    expect(out).not.toHaveProperty("agenda");
  });
});

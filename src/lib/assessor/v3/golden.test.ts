import { describe, it, expect } from "vitest";
import type { GoldenTurn } from "./golden.server";

// Testes puros da lógica de avaliação — não chamam gateway. A execução real
// contra o motor está coberta pela server function runGoldenSuite.
function evaluateTurn(reply: string, action: string, tools: string[], expect?: GoldenTurn["expect"]): string[] {
  const failures: string[] = [];
  if (!expect) return failures;
  if (expect.action && expect.action !== action) failures.push(`action:${action}≠${expect.action}`);
  if (expect.tool && !tools.includes(expect.tool)) failures.push(`missing_tool:${expect.tool}`);
  const low = reply.toLowerCase();
  for (const s of expect.reply_contains ?? []) if (!low.includes(s.toLowerCase())) failures.push(`missing:${s}`);
  for (const s of expect.must_not_contain ?? []) if (low.includes(s.toLowerCase())) failures.push(`forbidden:${s}`);
  return failures;
}

describe("Golden — avaliação de turnos", () => {
  it("passa quando action e conteúdo batem", () => {
    const f = evaluateTurn("Bom dia! Como te posso ajudar?", "acknowledge", [], {
      action: "acknowledge", must_not_contain: ["Feito", "payload"],
    });
    expect(f).toEqual([]);
  });

  it("falha quando action difere", () => {
    const f = evaluateTurn("Marquei a visita.", "act", [], { action: "acknowledge" });
    expect(f).toContain("action:act≠acknowledge");
  });

  it("falha quando tool esperado não existe", () => {
    const f = evaluateTurn("Aqui está.", "act", ["something_else"], { action: "act", tool: "agenda_today" });
    expect(f).toContain("missing_tool:agenda_today");
  });

  it("falha em vocabulário proibido", () => {
    const f = evaluateTurn("Feito, payload registado.", "acknowledge", [], {
      must_not_contain: ["Feito", "payload"],
    });
    expect(f.length).toBeGreaterThan(0);
  });
});
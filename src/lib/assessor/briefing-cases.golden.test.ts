import { describe, it, expect } from "vitest";
import { BRIEFING_CASES, runBriefingCase } from "./briefing-cases";

describe("casos golden do briefing (simulador)", () => {
  it("não tem nomes de caso duplicados", () => {
    const names = BRIEFING_CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const c of BRIEFING_CASES) {
    it(`${c.name} — ${c.rule}`, () => {
      const outcome = runBriefingCase(c);
      expect(outcome.failures.join(" | ")).toBe("");
      expect(outcome.passed).toBe(true);
    });
  }
});
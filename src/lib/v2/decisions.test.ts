import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { AFONSO_V2_DECISIONS } from "./decisions";

describe("rastreio das 50 decisões", () => {
  it("tem exatamente as decisões 1..50, sem repetidas", () => {
    expect(AFONSO_V2_DECISIONS.map((d) => d.id)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });
  it("cada decisão 'dev' aponta para ficheiros que existem", () => {
    for (const d of AFONSO_V2_DECISIONS.filter((x) => x.status === "dev")) {
      expect(d.where?.length, `decisão ${d.id}`).toBeGreaterThan(0);
      for (const f of d.where!) expect(existsSync(f), `${d.id}: ${f}`).toBe(true);
    }
  });
});

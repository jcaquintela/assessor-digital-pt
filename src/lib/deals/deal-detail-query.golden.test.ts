import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("consulta da ficha do negócio", () => {
  it("não pede a coluna inexistente kind aos seguimentos", () => {
    const source = readFileSync(new URL("./deals.functions.ts", import.meta.url), "utf8");
    const followUpsSelect = source.match(/from\("follow_ups"\)\.select\("([^"]+)"\)/)?.[1];

    expect(followUpsSelect).toBe("id, title, due_date, status, notes");
    expect(followUpsSelect?.split(/,\s*/)).not.toContain("kind");
  });
});
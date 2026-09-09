import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("consulta da ficha do negócio", () => {
  it("não pede a coluna inexistente kind aos seguimentos", () => {
    const source = readFileSync(new URL("./deals.functions.ts", import.meta.url), "utf8");

    expect(source).toContain('from("follow_ups").select("id, title, due_date, status, notes")');
    expect(source).not.toContain('select("id, title, due_date, status, notes, kind")');
  });
});
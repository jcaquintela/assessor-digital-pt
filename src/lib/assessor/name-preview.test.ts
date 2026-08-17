import { describe, expect, it } from "vitest";
import { assessorNamePreview } from "@/lib/assessor/name-preview";
import { ASSESSOR_NAME_DEFAULT } from "@/lib/assessor/assessor-name";

describe("preview do nome do assistente", () => {
  it("usa o nome escrito em todas as amostras", () => {
    const itens = assessorNamePreview("  Maria  ");
    expect(itens.length).toBeGreaterThan(3);
    for (const i of itens) expect(i.texto).toContain("Maria");
  });

  it("volta ao nome por defeito quando o campo está vazio", () => {
    for (const i of assessorNamePreview("")) expect(i.texto).toContain(ASSESSOR_NAME_DEFAULT);
  });
});

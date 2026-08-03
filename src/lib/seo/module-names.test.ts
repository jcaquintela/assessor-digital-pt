import { describe, it, expect } from "vitest";
import { MODULE_NAME, moduleTitle, pageTitle } from "./module-names";

describe("nomes de módulos", () => {
  it("o Drive chama-se sempre Drive Inteligente", () => {
    expect(MODULE_NAME.drive).toBe("Drive Inteligente");
  });

  it("gera o título do Drive de forma consistente", () => {
    expect(moduleTitle("drive")).toBe("Drive Inteligente — Afonso");
    expect(moduleTitle("drive", "Ficheiro")).toBe(
      "Ficheiro — Drive Inteligente — Afonso",
    );
  });

  it("nenhum nome visível usa 'Drive' sozinho", () => {
    for (const name of Object.values(MODULE_NAME)) {
      expect(/\bDrive\b(?! Inteligente)/.test(name)).toBe(false);
    }
  });

  it("pageTitle acrescenta o nome da app", () => {
    expect(pageTitle("Hoje")).toBe("Hoje — Afonso");
  });
});

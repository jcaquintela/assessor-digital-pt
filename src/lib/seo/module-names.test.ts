import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { MODULE_NAME, moduleTitle, pageTitle, type ModuleNames } from "./module-names";
import { appTitle } from "@/lib/brand";

describe("nomes de módulos", () => {
  it("o Drive chama-se sempre Drive Inteligente", () => {
    expect(MODULE_NAME.drive).toBe("Drive Inteligente");
  });

  it("gera o título do Drive de forma consistente", () => {
    expect(moduleTitle("drive")).toBe(appTitle("Drive Inteligente"));
    expect(moduleTitle("drive", "Ficheiro")).toBe(
      appTitle("Ficheiro — Drive Inteligente"),
    );
  });

  it("nenhum nome visível usa 'Drive' sozinho", () => {
    for (const name of Object.values(MODULE_NAME)) {
      expect(/\bDrive\b(?! Inteligente)/.test(name)).toBe(false);
    }
  });

  it("pageTitle acrescenta o nome da app", () => {
    expect(pageTitle("Hoje")).toBe(appTitle("Hoje"));
  });
});

describe("fonte única: nenhum 'Drive' sozinho", () => {
  // "Drive" só é aceitável quando seguido de "Inteligente".
  const DRIVE_SOZINHO = /\bDrive\b(?!\s+Inteligente)/;

  it("o valor visível do módulo drive nunca é 'Drive' sozinho", () => {
    expect(MODULE_NAME.drive).toBe("Drive Inteligente");
    expect(DRIVE_SOZINHO.test(MODULE_NAME.drive)).toBe(false);
  });

  it("os títulos gerados para o drive nunca contêm 'Drive' sozinho", () => {
    const titulos = [
      moduleTitle("drive"),
      moduleTitle("drive", "Ficheiro"),
      pageTitle(MODULE_NAME.drive),
    ];
    for (const t of titulos) {
      expect(DRIVE_SOZINHO.test(t)).toBe(false);
      expect(t).toContain("Drive Inteligente");
    }
  });

  it("o ficheiro da fonte única não tem literais com 'Drive' sozinho", () => {
    const src = readFileSync(
      new URL("./module-names.ts", import.meta.url),
      "utf8",
    );
    const literais = src.match(/"[^"]*"|`[^`]*`/g) ?? [];
    const maus = literais.filter((l) => DRIVE_SOZINHO.test(l));
    expect(maus).toEqual([]);
  });
});

describe("garantia em compile-time", () => {
  it("recusa qualquer nome que não seja 'Drive Inteligente'", () => {
    const base = {
      hoje: "Hoje",
      pessoas: "Pessoas",
      imoveis: "Imóveis",
      negocios: "Negócios",
      agenda: "Agenda",
      faturacao: "Faturação",
      diversos: "Diversos",
      prospecao: "Prospeção",
      definicoes: "Definições",
    };
    // @ts-expect-error — "Drive" sozinho não é atribuível a DriveModuleName.
    const mau: ModuleNames = { ...base, drive: "Drive" };
    const bom: ModuleNames = { ...base, drive: "Drive Inteligente" };
    expect(bom.drive).toBe(MODULE_NAME.drive);
    expect(mau.drive).toBe("Drive");
  });
});

import { describe, expect, it } from "vitest";
import { classifyExistingMisc, initialMiscClass } from "./misc-class";

describe("initialMiscClass", () => {
  it("rede de segurança é sempre falha de interpretação", () => {
    expect(initialMiscClass({ source: "safety_net", outcome: "not_understood" })).toBe("falha_interpretacao");
    expect(initialMiscClass({ source: "safety_net", outcome: "tool_failed" })).toBe("falha_interpretacao");
    expect(initialMiscClass({ source: "safety_net", outcome: "service_down" })).toBe("falha_interpretacao");
  });
  it("proposta substituída e proatividade esgotada são falha", () => {
    expect(initialMiscClass({ source: "superseded" })).toBe("falha_interpretacao");
    expect(initialMiscClass({ source: "proactive" })).toBe("falha_interpretacao");
  });
  it("notas pedidas pelo consultor são genuínas", () => {
    expect(initialMiscClass({ source: "register_only" })).toBe("genuino");
    expect(initialMiscClass({ source: "tool_save_misc" })).toBe("genuino");
    expect(initialMiscClass({ source: "dashboard" })).toBe("genuino");
    expect(initialMiscClass({ source: "fallback_save" })).toBe("genuino");
  });
  it("etiqueta técnica marca sempre falha, venha de onde vier", () => {
    expect(initialMiscClass({ source: "fallback_save", tags: ["falha_assessor"] })).toBe("falha_interpretacao");
    expect(initialMiscClass({ source: "dashboard", tags: ["tec:timeout"] })).toBe("falha_interpretacao");
  });
});

describe("classifyExistingMisc", () => {
  it("classifica registos antigos pelo que ficou gravado", () => {
    expect(classifyExistingMisc({ tags: ["falha_assessor", "tec:no_tool"] })).toBe("falha_interpretacao");
    expect(classifyExistingMisc({ title: "Proposta não confirmada: Casa A" })).toBe("falha_interpretacao");
    expect(classifyExistingMisc({ tags: ["proatividade_esgotada"] })).toBe("falha_interpretacao");
    expect(classifyExistingMisc({ title: "Comprar envelopes", tags: [] })).toBe("genuino");
  });
});

import { describe, it, expect } from "vitest";
import { observe } from "./observe.server";

describe("v3 observe", () => {
  it("extrai telefone e pista de placa", () => {
    const obs = observe("932345789 placa Madalena Praias");
    const types = obs.map((o) => o.type);
    expect(types).toContain("phone");
    expect(types).toContain("document_hint");
    expect(obs.some((o) => o.value.toLowerCase().includes("madalena"))).toBe(true);
  });

  it("marca resposta curta 'sim'", () => {
    const obs = observe("sim");
    expect(obs.some((o) => o.type === "short_answer" && o.value === "sim")).toBe(true);
  });

  it("detecta saudação", () => {
    const obs = observe("Bom dia");
    expect(obs.some((o) => o.type === "greeting")).toBe(true);
  });

  it("apanha CPU como pista de documento", () => {
    const obs = observe("CPU Moradia Boavista");
    expect(obs.some((o) => o.type === "document_hint" && o.value === "cpu")).toBe(true);
  });

  it("apanha tipologia T3 e verbo", () => {
    const obs = observe("Angariei um T3 no Porto");
    expect(obs.some((o) => o.type === "typology" && o.value === "T3")).toBe(true);
    expect(obs.some((o) => o.type === "verb")).toBe(true);
  });
});
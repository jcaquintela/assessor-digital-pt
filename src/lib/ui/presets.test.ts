import { describe, expect, it } from "vitest";
import { matchPeoplePreset, matchPropertyPreset } from "./presets";

describe("presets de pessoas", () => {
  const hoje = "2026-08-04";
  it("prioridades = ação para hoje ou atrasada", () => {
    expect(matchPeoplePreset({ proximaAcaoData: "2026-08-01" }, "prioridades", hoje)).toBe(true);
    expect(matchPeoplePreset({ proximaAcaoData: "2026-08-04" }, "prioridades", hoje)).toBe(true);
    expect(matchPeoplePreset({ proximaAcaoData: "2026-08-09" }, "prioridades", hoje)).toBe(false);
    expect(matchPeoplePreset({}, "prioridades", hoje)).toBe(false);
  });
  it("sem seguimento e clientes", () => {
    expect(matchPeoplePreset({}, "sem-seguimento", hoje)).toBe(true);
    expect(matchPeoplePreset({ proximaAcao: "ligar" }, "sem-seguimento", hoje)).toBe(false);
    expect(matchPeoplePreset({ relacao: "Cliente" }, "clientes", hoje)).toBe(true);
    expect(matchPeoplePreset({ relacao: "Potencial" }, "clientes", hoje)).toBe(false);
  });
  it("todos deixa passar tudo", () => {
    expect(matchPeoplePreset({ relacao: "Potencial" }, "todos", hoje)).toBe(true);
  });
});

describe("presets de imóveis", () => {
  it("carteira exclui vendidos e arquivados", () => {
    expect(matchPropertyPreset({ status: "angariado" }, "carteira")).toBe(true);
    expect(matchPropertyPreset({ status: "Vendido" }, "carteira")).toBe(false);
    expect(matchPropertyPreset({ status: "Vendido" }, "fechados")).toBe(true);
  });
  it("prioridades apanha fichas incompletas em carteira", () => {
    expect(matchPropertyPreset({ status: "angariado", address: "Rua A" }, "prioridades")).toBe(true);
    expect(matchPropertyPreset({ status: "angariado", address: "Rua A", asking_price: 250000 }, "prioridades")).toBe(false);
    expect(matchPropertyPreset({ status: "vendido" }, "prioridades")).toBe(false);
  });
});

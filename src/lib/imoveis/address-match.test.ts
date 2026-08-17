import { describe, it, expect } from "vitest";
import { addressMatchQuality, findAddressDuplicates, normalizeAddress } from "./address-match";

describe("normalização de morada", () => {
  it("expande abreviaturas e ignora pontuação e acentos", () => {
    expect(normalizeAddress("Av. da Boavista, 245")).toBe("avenida boavista 245");
    expect(normalizeAddress("R. do Ouro nº 12")).toBe("rua ouro 12");
    expect(normalizeAddress("Travessa das Águas")).toBe("travessa aguas");
  });

  it("morada vazia não gera ruído", () => {
    expect(normalizeAddress("  ")).toBe("");
    expect(normalizeAddress(null)).toBe("");
  });
});

describe("qualidade da correspondência", () => {
  it("mesma morada escrita de outra maneira é igual", () => {
    expect(addressMatchQuality("Av. da Boavista 245", "Avenida Boavista, 245")).toBe("igual");
  });

  it("mesma rua sem número é apenas provável", () => {
    expect(addressMatchQuality("Rua do Ouro", "R. do Ouro 12")).toBe("provavel");
  });

  it("números de porta diferentes não são a mesma casa", () => {
    expect(addressMatchQuality("Rua do Ouro 12", "Rua do Ouro 120")).toBe("provavel");
  });

  it("ruas diferentes na mesma cidade não casam", () => {
    expect(addressMatchQuality("Rua do Ouro, Porto", "Rua da Prata, Porto")).toBe("diferente");
  });

  it("morada em falta nunca inventa duplicado", () => {
    expect(addressMatchQuality("", "Rua do Ouro")).toBe("diferente");
  });
});

describe("candidatos a duplicado", () => {
  const carteira = [
    { id: "1", address: "Avenida da Boavista, 245", title: "T3 Boavista" },
    { id: "2", address: "Rua do Ouro", title: "T2 Ouro" },
    { id: "3", address: "Rua da Prata 8", title: "Loja Prata" },
  ];

  it("põe a correspondência exacta à frente da provável", () => {
    const r = findAddressDuplicates("Av. Boavista 245", carteira);
    expect(r.map((x) => x.item.id)).toEqual(["1"]);
    expect(r[0].quality).toBe("igual");
  });

  it("apanha a mesma rua sem número como provável", () => {
    const r = findAddressDuplicates("R. do Ouro, 30", carteira);
    expect(r).toHaveLength(1);
    expect(r[0].quality).toBe("provavel");
  });

  it("morada nova não gera avisos", () => {
    expect(findAddressDuplicates("Rua das Flores 10", carteira)).toEqual([]);
  });

  it("o próprio registo é ignorado ao editar", () => {
    expect(findAddressDuplicates("Rua da Prata 8", carteira, "3")).toEqual([]);
  });
});
import { describe, it, expect } from "vitest";
import { cleanShortName, composeShortName, nameWordCount } from "./short-name";

describe("cleanShortName", () => {
  it("limita a 5 palavras e limpa aspas", () => {
    const n = cleanShortName('"Visita de angariação a moradia em Canedo na quinta-feira"');
    expect(n).toBe("Visita de angariação a moradia");
    expect(nameWordCount(n!)).toBeLessThanOrEqual(5);
  });
  it("recusa resumos vazios ou curtos demais", () => {
    expect(cleanShortName("")).toBeNull();
    expect(cleanShortName("ok")).toBeNull();
  });
  it("tira prefixos do modelo", () => {
    expect(cleanShortName("Título: Reunião com o construtor")).toBe("Reunião com o construtor");
  });
});

describe("composeShortName", () => {
  it("marca o tipo do ficheiro", () => {
    const n = composeShortName("audio", "Agendar visita em Estarreja");
    expect(n).toBe("Nota de voz · Agendar visita em Estarreja");
    expect(nameWordCount(n!)).toBe(4);
  });
  it("não repete o prefixo", () => {
    expect(composeShortName("imagem", "Foto de cartão de Nuno")).toBe("Foto de cartão de Nuno");
  });
  it("sem resumo utilizável devolve null", () => {
    expect(composeShortName("audio", " ")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { detectSparringEnd, detectSparringStart, isSparringActive, SPARRING_TOPIC } from "./sparring";

describe("sparring", () => {
  it("deteta pedidos de treino", () => {
    expect(detectSparringStart("treina comigo uma objeção de preço")).toBe(true);
    expect(detectSparringStart("simula um proprietário a duvidar da comissão")).toBe(true);
    expect(detectSparringStart("ajuda-me a preparar esta conversa")).toBe(true);
    expect(detectSparringStart("marca visita amanhã às 10h")).toBe(false);
  });

  it("deteta fim do treino", () => {
    expect(detectSparringEnd("chega")).toBe(true);
    expect(detectSparringEnd("terminar treino")).toBe(true);
    expect(detectSparringEnd("voltamos ao normal")).toBe(true);
    expect(detectSparringEnd("o preço é justo")).toBe(false);
  });

  it("lê o estado activo", () => {
    expect(isSparringActive({ active_topic: SPARRING_TOPIC })).toBe(true);
    expect(isSparringActive({ active_topic: null })).toBe(false);
    expect(isSparringActive(null)).toBe(false);
  });
});

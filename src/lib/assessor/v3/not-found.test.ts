import { describe, expect, it } from "vitest";
import { inputSample, isEntityNotFound, notFoundEntity } from "./not-found";

describe("falhas de entidade não encontrada", () => {
  it("deteta os quatro erros canónicos", () => {
    expect(isEntityNotFound("pessoa_nao_encontrada")).toBe(true);
    expect(isEntityNotFound("imovel_nao_encontrado")).toBe(true);
    expect(isEntityNotFound("invalid_args:id inválido")).toBe(false);
    expect(isEntityNotFound(null)).toBe(false);
  });

  it("nomeia a entidade em português", () => {
    expect(notFoundEntity("pessoa_nao_encontrada")).toBe("pessoa");
    expect(notFoundEntity("rotina_nao_encontrada")).toBe("rotina");
    expect(notFoundEntity("boom")).toBeNull();
  });

  it("mascara contactos e trunca textos na amostra", () => {
    const s = inputSample({
      id: "abc",
      phone: "+351912345678",
      email: "ana.catarina@exemplo.pt",
      notes: "x".repeat(120),
    })!;
    expect(s.phone).toBe("…5678");
    expect(s.email).toBe("an…@exemplo.pt");
    expect(String(s.notes)).toHaveLength(61);
  });

  it("limita o número de campos", () => {
    const s = inputSample({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 })!;
    expect(Object.keys(s)).toHaveLength(7);
    expect(s["…"]).toBe("+2 campos");
  });
});

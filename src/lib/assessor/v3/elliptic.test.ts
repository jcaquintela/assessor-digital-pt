import { describe, it, expect } from "vitest";
import { detectEllipticEntity, ellipticConfirmQuestion } from "./elliptic";

describe("frases elípticas", () => {
  it("golden: entidade nova sem verbo propõe criação assistida", () => {
    const d = detectEllipticEntity("Seguimento à lead Maria Manuela 912 333 411");
    expect(d).not.toBeNull();
    expect(d!.name).toBe("Maria Manuela");
    expect(d!.phone).toBe("912333411");
    expect(d!.entityWord).toBe("lead");
    expect(d!.withFollowUp).toBe(true);
    expect(ellipticConfirmQuestion(d!)).toBe(
      "Queres que registe a Maria Manuela como lead nova com seguimento?",
    );
  });

  it("aceita sem conector e com +351", () => {
    const d = detectEllipticEntity("Contacto cliente João Pedro +351 913 555 666");
    expect(d?.name).toBe("João Pedro");
    expect(d?.phone).toBe("913555666");
    expect(d?.withFollowUp).toBe(false);
  });

  it("aceita entidade sem telefone quando há palavra de entidade", () => {
    expect(detectEllipticEntity("Seguimento à lead Ana Silva")?.name).toBe("Ana Silva");
  });

  it("ignora perguntas", () => {
    expect(detectEllipticEntity("Seguimento à lead Maria Manuela?")).toBeNull();
  });

  it("ignora frases sem nome", () => {
    expect(detectEllipticEntity("Seguimento à lead 912 333 411")).toBeNull();
    expect(detectEllipticEntity("Bom dia, tudo bem")).toBeNull();
  });
});

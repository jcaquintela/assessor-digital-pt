import { describe, it, expect } from "vitest";
import { CORRECTION_HINT_RE, looksLikeCorrection } from "./corrections.server";

describe("Corrections — deteção", () => {
  it("apanha 'não é o Paulo, é o Pedro'", () => {
    expect(CORRECTION_HINT_RE.test("Não é o Paulo, é o Pedro")).toBe(true);
  });
  it("apanha 'apaga essa'", () => {
    expect(CORRECTION_HINT_RE.test("apaga essa tarefa")).toBe(true);
  });
  it("ignora mensagem neutra", () => {
    expect(CORRECTION_HINT_RE.test("Marca para amanhã às 10h")).toBe(false);
  });
  it("looksLikeCorrection só dispara dentro de 90s", () => {
    const past = new Date(Date.now() - 30_000);
    const old = new Date(Date.now() - 5 * 60_000);
    expect(looksLikeCorrection("não é o Paulo", past)).toBe(true);
    expect(looksLikeCorrection("não é o Paulo", old)).toBe(false);
    expect(looksLikeCorrection("não é o Paulo", null)).toBe(false);
  });
});
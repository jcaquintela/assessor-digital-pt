import { describe, it, expect } from "vitest";
import { isUnavailableStatus } from "../v2/gateway.server";
import { shouldArchiveTurn } from "./safety-net.server";
import { NATURAL_FALLBACKS } from "../culture/sanitize";

describe("classificação de falhas do gateway", () => {
  it("trata créditos, rate limit e erros do provedor como indisponibilidade", () => {
    expect(isUnavailableStatus(402)).toBe(true);
    expect(isUnavailableStatus(403, { error: { type: "credit_limit_reached" } })).toBe(true);
    expect(isUnavailableStatus(429)).toBe(true);
    expect(isUnavailableStatus(503)).toBe(true);
  });
  it("não confunde um pedido inválido nosso com indisponibilidade", () => {
    expect(isUnavailableStatus(400, { error: { message: "unknown field" } })).toBe(false);
    expect(isUnavailableStatus(401)).toBe(false);
  });
});

describe("rede de segurança", () => {
  it("guarda a mensagem quando o serviço esteve em baixo", () => {
    expect(shouldArchiveTurn({
      content: "marca visita com a Ana amanhã às 10h",
      outcome: "service_down",
    })).toBe(true);
  });
  it("não guarda um simples 'sim' mesmo com serviço em baixo", () => {
    expect(shouldArchiveTurn({ content: "sim", outcome: "service_down" })).toBe(false);
  });
  it("a frase de indisponibilidade é diferente da de incompreensão", () => {
    expect(NATURAL_FALLBACKS.aiDown).not.toBe(NATURAL_FALLBACKS.didNotUnderstand);
    expect(NATURAL_FALLBACKS.aiDown).toMatch(/dificuldade|instantes/i);
  });
});

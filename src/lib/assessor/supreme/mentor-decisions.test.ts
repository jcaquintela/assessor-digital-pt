import { describe, it, expect } from "vitest";
import { applyDecisions, decisionEffect, lastDecision, type MentorDecision } from "./mentor-decisions";

const NOW = Date.parse("2026-08-15T12:00:00Z");
const haDias = (n: number) => new Date(NOW - n * 864e5).toISOString();
const tip = { key: "imoveis-parados", text: 'Tens 3 imóveis "Por angariar" há mais de 10 dias.' };
const d = (over: Partial<MentorDecision>): MentorDecision => ({
  tipKey: "imoveis-parados",
  decision: "confirmar",
  createdAt: haDias(1),
  ...over,
});

describe("memória de decisões do Mentor", () => {
  it("sem decisões, a sugestão sai tal e qual", () => {
    expect(applyDecisions(tip, [], NOW)).toEqual(tip);
  });

  it("confirmar cala o sinal 7 dias", () => {
    expect(applyDecisions(tip, [d({ createdAt: haDias(3) })], NOW)).toBeNull();
    expect(decisionEffect([d({ createdAt: haDias(3) })], tip.key, NOW).daysLeft).toBe(4);
  });

  it("passados os 7 dias, volta a retomar o assunto em vez de o apresentar como novo", () => {
    const r = applyDecisions(tip, [d({ createdAt: haDias(9) })], NOW)!;
    expect(r.text).toContain("Da última vez disseste que ias tratar disto");
    expect(r.text).toContain(tip.text);
  });

  it("editar cala 14 dias e depois lembra o ajuste escrito", () => {
    const dec = d({ decision: "editar", note: "só os de Cascais" });
    expect(applyDecisions(tip, [{ ...dec, createdAt: haDias(10) }], NOW)).toBeNull();
    const r = applyDecisions(tip, [{ ...dec, createdAt: haDias(20) }], NOW)!;
    expect(r.text).toContain("só os de Cascais");
  });

  it("cancelar cala 90 dias", () => {
    const dec = d({ decision: "cancelar" });
    expect(applyDecisions(tip, [{ ...dec, createdAt: haDias(60) }], NOW)).toBeNull();
    expect(applyDecisions(tip, [{ ...dec, createdAt: haDias(100) }], NOW)).not.toBeNull();
  });

  it("tratado cala 60 dias e depois reconhece que já tinha sido tratado", () => {
    const dec = d({ decision: "tratado" });
    expect(applyDecisions(tip, [{ ...dec, createdAt: haDias(30) }], NOW)).toBeNull();
    const r = applyDecisions(tip, [{ ...dec, createdAt: haDias(70) }], NOW)!;
    expect(r.text).toContain("Já tinhas dado este assunto como tratado");
    expect(r.text).toContain(tip.text);
  });

  it("a decisão só afeta o mesmo sinal", () => {
    const outra = d({ tipKey: "negocios-parados", decision: "cancelar", createdAt: haDias(1) });
    expect(applyDecisions(tip, [outra], NOW)).toEqual(tip);
  });

  it("vale sempre a decisão mais recente", () => {
    const decisions = [
      d({ decision: "cancelar", createdAt: haDias(100) }),
      d({ decision: "confirmar", createdAt: haDias(2) }),
    ];
    expect(applyDecisions(tip, decisions, NOW)).toBeNull();
    expect(decisionEffect(decisions, tip.key, NOW).last?.decision).toBe("confirmar");
  });

  it("desfazer (remover a decisão mais recente) faz o sinal voltar a ser considerado", () => {
    const decisions = [d({ decision: "tratado", createdAt: haDias(1) })];
    expect(applyDecisions(tip, decisions, NOW)).toBeNull();
    expect(lastDecision(decisions, tip.key)?.decision).toBe("tratado");
    // Simula o desfazer: a decisão foi removida.
    expect(applyDecisions(tip, [], NOW)).toEqual(tip);
  });
});

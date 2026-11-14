import { describe, it, expect } from "vitest";
import { evaluateGate, evaluateAllGates, AFONSO_V2_GATES, GATE_AUTHORIZATIONS, type Gate } from "./gates";

const ok = (id: Gate["id"], previous: Gate["previous"]): Gate => ({
  id, title: id, previous, criteria: [{ id: "c", label: "c", status: "met", evidence: "x" }],
});

describe("gates GO/NO-GO", () => {
  it("todos os critérios cumpridos sem autorização = NO-GO", () => {
    expect(evaluateGate(ok("G1_internal", null), null, null)).toMatchObject({ decision: "NO-GO", blocking: ["autorizacao_expressa"] });
  });
  it("autorização de outro gate não serve", () => {
    expect(evaluateGate(ok("G1_internal", null), null, { gate: "G2_pilot", by: "Júlio", at: "2026-11-14" }).decision).toBe("NO-GO");
  });
  it("critérios + autorização = GO", () => {
    expect(evaluateGate(ok("G1_internal", null), null, { gate: "G1_internal", by: "Júlio", at: "2026-11-14" }).decision).toBe("GO");
  });
  it("'não verificado' bloqueia como 'não cumprido'", () => {
    const g: Gate = { ...ok("G1_internal", null), criteria: [{ id: "x", label: "x", status: "unverified", evidence: "" }] };
    expect(evaluateGate(g, null, { gate: "G1_internal", by: "J", at: "t" }).blocking).toContain("x");
  });
  it("gate seguinte nunca passa sem o anterior em GO", () => {
    const d = evaluateGate(ok("G2_pilot", "G1_internal"), { gate: "G1_internal", decision: "NO-GO", blocking: ["a"] }, { gate: "G2_pilot", by: "J", at: "t" });
    expect(d.blocking).toContain("gate_anterior:G1_internal");
  });
  it("estado atual: os quatro gates estão em NO-GO e nenhum está autorizado", () => {
    expect(GATE_AUTHORIZATIONS).toHaveLength(0);
    expect(evaluateAllGates(AFONSO_V2_GATES, GATE_AUTHORIZATIONS).map((d) => d.decision)).toEqual(["NO-GO", "NO-GO", "NO-GO", "NO-GO"]);
  });
});

import { describe, it, expect } from "vitest";
import {
  canTransition,
  getNextState,
  isPendingActionValid,
  shouldExpireState,
  clearCompletedState,
  applyCorrectionToState,
  fromDbStatus,
  toDbStatus,
  type PendingSnapshot,
} from "./state-machine";

const NOW = new Date("2026-07-27T08:00:00Z");
const inFuture = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const inPast = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("state-machine: transições permitidas", () => {
  it("1. idle → collecting_information", () => {
    expect(canTransition("idle", "collecting_information")).toBe(true);
  });
  it("2. collecting_information → awaiting_confirmation", () => {
    expect(canTransition("collecting_information", "awaiting_confirmation")).toBe(true);
  });
  it("3. awaiting_confirmation + confirm → executing", () => {
    expect(getNextState("awaiting_confirmation", "user_confirmed")).toBe("executing");
  });
  it("4. executing → completed", () => {
    expect(getNextState("executing", "execution_ok")).toBe("completed");
    expect(canTransition("executing", "completed")).toBe(true);
  });
  it("5. completed → idle", () => {
    expect(clearCompletedState("completed")).toBe("idle");
    expect(canTransition("completed", "idle")).toBe(true);
  });
  it("6. awaiting_confirmation + reject → cancelled", () => {
    expect(getNextState("awaiting_confirmation", "user_rejected")).toBe("cancelled");
  });
  it("7. cancelled → idle", () => {
    expect(clearCompletedState("cancelled")).toBe("idle");
  });
  it("8-9. correção de data/hora leva a correction_pending", () => {
    expect(getNextState("awaiting_confirmation", "user_corrected")).toBe("correction_pending");
    expect(canTransition("correction_pending", "awaiting_confirmation")).toBe(true);
  });
  it("15. execution_failed → failed", () => {
    expect(getNextState("executing", "execution_failed")).toBe("failed");
  });
  it("16. failed pode voltar a awaiting_confirmation (retry)", () => {
    expect(canTransition("failed", "awaiting_confirmation")).toBe(true);
  });
  it("bloqueia transições ilegais", () => {
    expect(canTransition("idle", "completed")).toBe(false);
    expect(canTransition("completed", "executing")).toBe(false);
    expect(canTransition("cancelled", "awaiting_confirmation")).toBe(false);
  });
});

describe("state-machine: validade e expiração", () => {
  it("10. pending expirado é inválido", () => {
    const p: PendingSnapshot = { id: "x", status: "pending_confirmation", expires_at: inPast(1000) };
    expect(shouldExpireState(p, NOW)).toBe(true);
    expect(isPendingActionValid(p, NOW)).toBe(false);
  });
  it("11. ação antiga não confirma", () => {
    const p: PendingSnapshot = { id: "old", status: "pending_confirmation", expires_at: inPast(1) };
    expect(isPendingActionValid(p, NOW)).toBe(false);
  });
  it("12. saudação sobre ação obsoleta — snapshot inválido não passa", () => {
    const stale: PendingSnapshot = { id: "s", status: "pending_confirmation", expires_at: inPast(60_000) };
    expect(isPendingActionValid(stale, NOW)).toBe(false);
  });
  it("13. reinício com ação persistente ainda válida", () => {
    const p: PendingSnapshot = { id: "a", status: "pending_confirmation", expires_at: inFuture(60_000) };
    expect(isPendingActionValid(p, NOW)).toBe(true);
  });
  it("17. estados finais são limpos com segurança", () => {
    expect(clearCompletedState("expired")).toBe("idle");
    expect(clearCompletedState("failed")).toBe("idle");
    expect(clearCompletedState("awaiting_confirmation")).toBe("awaiting_confirmation");
  });
});

describe("state-machine: correções e mapeamento DB", () => {
  it("aplica correção de data/hora sem apagar outros campos", () => {
    const ent = { event_type: "visita", person_name: "Paulo", date: "2026-07-27", start_time: "10:00" };
    const next = applyCorrectionToState(ent, { date: "2026-07-28", time: "11:00" });
    expect(next).toMatchObject({ event_type: "visita", person_name: "Paulo", date: "2026-07-28", start_time: "11:00" });
  });
  it("aplica substituição de pessoa", () => {
    const ent = { person_name: "Paulo", date: "2026-07-28" };
    const next = applyCorrectionToState(ent, { person_name: "Pedro" });
    expect(next.person_name).toBe("Pedro");
    expect(next.date).toBe("2026-07-28");
  });
  it("mapeia estados DB ↔ conversação", () => {
    expect(fromDbStatus("pending_confirmation")).toBe("awaiting_confirmation");
    expect(fromDbStatus("executed")).toBe("completed");
    expect(toDbStatus("awaiting_confirmation")).toBe("pending_confirmation");
    expect(toDbStatus("completed")).toBe("executed");
  });
});
// Golden tests — conflitos de horário depois da correção de 29/08:
// duração real do provedor, mensagem com as horas certas, e esclarecimento
// que não pode disparar remarcação.

import { describe, it, expect } from "vitest";
import { findConflicts } from "./conflicts";
import { conflictMessage } from "./conflict-message";
import { readRescheduleIntent, isScheduleClarification } from "./reschedule-intent";

const NOW = new Date("2026-08-29T09:00:00Z"); // sábado, 10:00 Lisboa

describe("conflitos com duração real", () => {
  it("G1 — 30 min reais em vez de 60 assumidos: deixa de haver conflito", () => {
    const base = [
      { id: "a", title: "Level-Up 2026", due_date: "2026-08-31T09:00:00Z", due_time: "10:00" },
      { id: "b", title: "OPS COMMAND", due_date: "2026-08-31T09:45:00Z", due_time: "10:45" },
    ];
    // Sem duração real: os 60 min por omissão criam a sobreposição.
    expect(findConflicts(base)).toHaveLength(1);
    // Com a duração real do calendário (30 min), não há conflito nenhum.
    const real = base.map((e) => ({ ...e, duration_minutes: 30 }));
    expect(findConflicts(real)).toHaveLength(0);
  });

  it("G2 — a mensagem diz a hora real de cada compromisso, não a da colisão", () => {
    const pairs = findConflicts([
      { id: "a", title: "Level-Up 2026", due_date: "2026-08-31T09:00:00Z", due_time: "10:00", duration_minutes: 60 },
      { id: "b", title: "OPS COMMAND", due_date: "2026-08-31T09:45:00Z", due_time: "10:45", duration_minutes: 30 },
    ]);
    expect(pairs).toHaveLength(1);
    const msg = conflictMessage(pairs[0]!, NOW);
    expect(msg).toContain("“Level-Up 2026” (10:00–11:00)");
    expect(msg).toContain("“OPS COMMAND” (10:45–11:15)");
    expect(msg).not.toContain("ao mesmo tempo");
  });
});

describe("esclarecimento vs pedido de remarcação", () => {
  it("G3 — 'Um é as 10 e o outro às 10:45' é esclarecimento: não remarca", () => {
    const v = readRescheduleIntent("Um é as 10 e o outro às 10:45");
    expect(v.clarification).toBe(true);
    expect(v.explicitReschedule).toBe(false);
  });

  it("G4 — 'muda o Level-Up para as 10h' continua a remarcar", () => {
    const v = readRescheduleIntent("muda o Level-Up para as 10h");
    expect(v.explicitReschedule).toBe(true);
    expect(v.clarification).toBe(false);
    expect(isScheduleClarification("passa o OPS COMMAND para as 11:30")).toBe(false);
    expect(isScheduleClarification("adia a visita para amanhã às 15h")).toBe(false);
  });
});

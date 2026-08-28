import { describe, expect, it } from "vitest";
import { findConflicts, toWindows } from "./conflicts";
import { conflictMessage, relativeDayLabel } from "./conflict-message";

const ev = (id: string, title: string, date: string, time: string | null, series?: string) => ({
  id, title, due_date: date, due_time: time, series_id: series ?? null,
});

describe("deteção de conflitos", () => {
  it("sobreposição parcial conta como conflito", () => {
    const pairs = findConflicts([
      ev("a", "Visita T2 Canelas", "2026-09-01", "10:00"),
      ev("b", "Reunião de equipa", "2026-09-01", "10:30"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.a.title).toBe("Visita T2 Canelas");
  });

  it("compromissos encostados não colidem", () => {
    expect(findConflicts([
      ev("a", "Visita", "2026-09-01", "10:00"),
      ev("b", "Reunião", "2026-09-01", "11:00"),
    ])).toHaveLength(0);
  });

  it("compromissos sem hora (dia inteiro) nunca colidem", () => {
    expect(toWindows([ev("a", "Férias", "2026-09-01", null)])).toHaveLength(0);
    expect(findConflicts([
      ev("a", "Férias", "2026-09-01", null),
      ev("b", "Visita", "2026-09-01", "10:00"),
    ])).toHaveLength(0);
  });

  it("duas ocorrências da mesma série não são conflito", () => {
    expect(findConflicts([
      ev("a", "Weekly", "2026-09-01", "09:00", "serie-1"),
      ev("b", "Weekly", "2026-09-01", "09:00", "serie-1"),
    ])).toHaveLength(0);
  });

  it("duplicado de importação (mesmo título e hora) não é conflito", () => {
    expect(findConflicts([
      ev("a", "Weekly closing", "2026-09-01", "09:00"),
      ev("b", "weekly closing", "2026-09-01", "09:00"),
    ])).toHaveLength(0);
  });

  it("dias diferentes não colidem", () => {
    expect(findConflicts([
      ev("a", "Visita", "2026-09-01", "10:00"),
      ev("b", "Reunião", "2026-09-02", "10:00"),
    ])).toHaveLength(0);
  });

  it("três sobrepostos geram os três pares", () => {
    expect(findConflicts([
      ev("a", "A", "2026-09-01", "10:00"),
      ev("b", "B", "2026-09-01", "10:15"),
      ev("c", "C", "2026-09-01", "10:30"),
    ])).toHaveLength(3);
  });
});

describe("mensagem de conflito", () => {
  it("nomeia os dois compromissos, o dia e a hora", () => {
    const now = new Date("2026-08-31T09:00:00Z");
    const pair = findConflicts([
      ev("a", "Visita T2 Canelas", "2026-09-01", "10:00"),
      ev("b", "Reunião de equipa", "2026-09-01", "10:30"),
    ])[0]!;
    expect(conflictMessage(pair, now)).toBe(
      "Tens dois compromissos ao mesmo tempo amanhã às 10:30: “Visita T2 Canelas” e “Reunião de equipa”. Queres remarcar algum?",
    );
  });

  it("usa 'hoje' quando é no próprio dia", () => {
    const now = new Date("2026-09-01T07:00:00Z");
    expect(relativeDayLabel(new Date("2026-09-01T09:30:00Z").getTime(), now)).toBe("hoje");
  });
});

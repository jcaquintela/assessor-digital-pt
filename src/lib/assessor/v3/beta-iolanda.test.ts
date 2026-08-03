import { describe, it, expect } from "vitest";
import { readNameAnswer } from "./onboarding";
import { detectAgendaQuery, isBareAcknowledgement } from "./deterministic.server";
import { nextRunAfter } from "../routines-run.server";

// Bugs reais encontrados na primeira conversa de beta (03/08, WhatsApp).
describe("bug 1 — renomeação com cláusula condicional", () => {
  it("'Se não te importares, fica Vanessa' → Vanessa", () => {
    expect(readNameAnswer("Se não te importares, fica Vanessa")).toEqual({ kind: "rename", name: "Vanessa" });
  });
  it("'chama-me Rui' continua a funcionar", () => {
    expect(readNameAnswer("chama-me Rui")).toEqual({ kind: "rename", name: "Rui" });
  });
  it("nunca aceita 'não' como nome", () => {
    expect(readNameAnswer("Não, obrigada").kind).not.toBe("rename");
    expect(readNameAnswer("fica assim")).toEqual({ kind: "keep" });
  });
  it("nome solto mantém-se", () => {
    expect(readNameAnswer("Vanessa")).toEqual({ kind: "rename", name: "Vanessa" });
  });
});

describe("bug 2 — pedido composto não é consulta de agenda", () => {
  it("visita + lembrete recorrente vai ao motor, não ao atalho", () => {
    expect(detectAgendaQuery(
      "Amanhã tenho uma visita no apartamento T2 da rua de consortes às 14:30. Recorda-me pela manhã. Aliás pretendo que me lembres a agenda do dia, todos os dias de manhã às 9:45. Combinado?",
    )).toBeNull();
  });
  it("consulta pura continua a ser atalho", () => {
    expect(detectAgendaQuery("O que tenho amanhã?")).toBe("tomorrow");
    expect(detectAgendaQuery("E hoje?")).toBe("today");
  });
  it("'lembra-me' nunca é consulta", () => {
    expect(detectAgendaQuery("Lembra-me da agenda de hoje?")).toBeNull();
  });
});

describe("bug 3 — 'Ok' é reconhecimento", () => {
  it("reconhece ok/certo/perfeito", () => {
    expect(isBareAcknowledgement("Ok")).toBe(true);
    expect(isBareAcknowledgement("perfeito!")).toBe(true);
    expect(isBareAcknowledgement("obrigada")).toBe(true);
  });
  it("não apanha frases com conteúdo", () => {
    expect(isBareAcknowledgement("ok marca para as 15h")).toBe(false);
  });
});

describe("rotinas — próxima ocorrência", () => {
  const base = { id: "r1", user_id: "u", title: "Agenda", notes: null, interval_n: 1, weekday: null, day_of_month: null, next_run_at: "", person_id: null, opportunity_id: null, priority: null } as any;
  it("diária avança para o dia seguinte quando a hora já passou", () => {
    const from = new Date("2026-08-03T10:00:00Z");
    const next = nextRunAfter({ ...base, frequency: "daily", time_of_day: "09:45" }, from);
    expect(next.toISOString()).toBe("2026-08-04T09:45:00.000Z");
  });
  it("diária fica no próprio dia quando a hora ainda vem", () => {
    const from = new Date("2026-08-03T08:00:00Z");
    const next = nextRunAfter({ ...base, frequency: "daily", time_of_day: "09:45" }, from);
    expect(next.toISOString()).toBe("2026-08-03T09:45:00.000Z");
  });
});

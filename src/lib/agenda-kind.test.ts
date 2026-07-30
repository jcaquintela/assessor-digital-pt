import { describe, it, expect } from "vitest";
import { isAgendaEvent } from "./agenda-kind";

describe("isAgendaEvent", () => {
  it("tipos de evento contam como compromisso", () => {
    expect(isAgendaEvent("Evento")).toBe(true);
    expect(isAgendaEvent("event")).toBe(true);
    expect(isAgendaEvent("visita")).toBe(true);
    expect(isAgendaEvent("reuniao_angariacao")).toBe(true);
  });
  it("tarefas e chamadas não vão para o calendário", () => {
    expect(isAgendaEvent("tarefa", "09:30")).toBe(false);
    expect(isAgendaEvent("chamada", "10:00")).toBe(false);
    expect(isAgendaEvent("email", "10:00")).toBe(false);
  });
  it("tipo desconhecido com hora específica é compromisso", () => {
    expect(isAgendaEvent("formacao", "09:30")).toBe(true);
    expect(isAgendaEvent("formacao", null)).toBe(false);
  });
});

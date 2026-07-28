import { describe, it, expect } from "vitest";
import { detectAgendaPeriod, formatAgendaReply, buildDescriptiveTitle, addDaysYmd, lisbonParts } from "./agenda";

const NOW = new Date("2026-07-27T10:00:00Z"); // segunda-feira Lisboa

describe("detectAgendaPeriod", () => {
  it("hoje", () => expect(detectAgendaPeriod("o que tenho hoje?", NOW)?.kind).toBe("today"));
  it("amanhã", () => expect(detectAgendaPeriod("o que tenho amanhã?", NOW)?.kind).toBe("tomorrow"));
  it("esta semana", () => {
    const p = detectAgendaPeriod("Que agendamentos tenho esta semana?", NOW);
    expect(p?.kind).toBe("week");
    expect(p?.from).toBe("2026-07-27"); // segunda
    expect(p?.to).toBe("2026-08-02"); // domingo
  });
  it("próxima semana", () => {
    const p = detectAgendaPeriod("E para a próxima semana?", NOW);
    expect(p?.kind).toBe("next_week");
    expect(p?.from).toBe("2026-08-03");
    expect(p?.to).toBe("2026-08-09");
  });
  it("agendamentos sem período → hoje", () => {
    expect(detectAgendaPeriod("que agendamentos tenho?", NOW)?.kind).toBe("today");
  });
  it("não confunde 'esta semana' com 'hoje'", () => {
    const p = detectAgendaPeriod("Que agendamentos tenho esta semana?", NOW);
    expect(p?.kind).not.toBe("today");
  });
});

describe("formatAgendaReply", () => {
  it("semana vazia", () => {
    const p = detectAgendaPeriod("esta semana", NOW)!;
    expect(formatAgendaReply({ period: p, rows: [], now: NOW })).toMatch(/Não tens agendamentos para esta semana/);
  });
  it("semana com 2 dias diferentes agrupa por dia", () => {
    const p = detectAgendaPeriod("esta semana", NOW)!;
    const reply = formatAgendaReply({
      period: p,
      rows: [
        { title: "Ligar ao Paulo", type: "task", due_date: "2026-07-28", due_time: "13:00", status: "Pendente" },
        { title: "Visita ao T3 em Espinho", type: "event", due_date: "2026-07-29", due_time: "15:00", status: "Pendente" },
      ],
      now: NOW,
    });
    expect(reply).toMatch(/Esta semana tens/);
    expect(reply).toMatch(/13h — Ligar ao Paulo/);
    expect(reply).toMatch(/15h — Visita ao T3 em Espinho/);
    expect(reply).toMatch(/terça-feira/i);
    expect(reply).toMatch(/quarta-feira/i);
  });
  it("hoje sem hora conta como 'sem hora definida'", () => {
    const p = detectAgendaPeriod("hoje", NOW)!;
    const reply = formatAgendaReply({
      period: p,
      rows: [{ title: "Preparar CPCV", type: "task", due_date: "2026-07-27", due_time: null, status: "Pendente" }],
      now: NOW,
    });
    expect(reply).toMatch(/1 seguimento sem hora definida/);
  });
  it("ignora concluídos e cancelados", () => {
    const p = detectAgendaPeriod("hoje", NOW)!;
    const reply = formatAgendaReply({
      period: p,
      rows: [
        { title: "X", type: "task", due_date: "2026-07-27", due_time: "10:00", status: "Concluído" },
        { title: "Y", type: "task", due_date: "2026-07-27", due_time: "11:00", status: "Cancelado" },
      ],
      now: NOW,
    });
    expect(reply).toMatch(/Hoje não tens nada agendado/);
  });
  it("mudança de mês/ano dentro do intervalo", () => {
    const p = { kind: "range" as const, from: "2026-12-30", to: "2027-01-02", label: "" };
    const reply = formatAgendaReply({
      period: p,
      rows: [
        { title: "A", type: "task", due_date: "2026-12-31", due_time: "10:00", status: "Pendente" },
        { title: "B", type: "task", due_date: "2027-01-01", due_time: "12:00", status: "Pendente" },
      ],
      now: NOW,
    });
    expect(reply).toMatch(/quinta-feira/i);
    expect(reply).toMatch(/sexta-feira/i);
  });
});

describe("buildDescriptiveTitle", () => {
  it("verbo + pessoa → 'Ligar ao Paulo'", () => {
    expect(buildDescriptiveTitle({
      intent: "create_follow_up",
      entities: { person_name: "Paulo" },
      originalText: "Lembra-me de ligar ao Paulo amanhã às 12h",
    })).toBe("Ligar ao Paulo");
  });
  it("verbo + pessoa feminina → 'Enviar para a Ana'", () => {
    expect(buildDescriptiveTitle({
      intent: "create_follow_up",
      entities: { person_name: "Ana" },
      originalText: "Enviar documentação à Ana",
    })).toMatch(/^Enviar para a Ana$/);
  });
  it("evento com imóvel e local", () => {
    expect(buildDescriptiveTitle({
      intent: "create_event",
      entities: { event_type: "visita", property_type: "T3", location: "Espinho" },
      originalText: "Visita ao T3 em Espinho amanhã às 15h",
    })).toBe("Visita ao T3 em Espinho");
  });
  it("sem contexto → 'Seguimento'", () => {
    expect(buildDescriptiveTitle({
      intent: "create_follow_up",
      entities: {},
      originalText: "isto",
    })).toBe("Seguimento");
  });
  it("nunca devolve apenas 'Tarefa'", () => {
    const r = buildDescriptiveTitle({
      intent: "create_follow_up",
      entities: { title: "Tarefa", person_name: "Paulo" },
      originalText: "Ligar ao Paulo",
    });
    expect(r).not.toBe("Tarefa");
    expect(r).toBe("Ligar ao Paulo");
  });
});

describe("lisbonParts / addDaysYmd", () => {
  it("Lisboa: segunda 27/07/2026", () => {
    const { ymd, weekday } = lisbonParts(NOW);
    expect(ymd).toBe("2026-07-27");
    expect(weekday).toBe(1); // Mon
  });
  it("addDays atravessa mês/ano", () => {
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
  });
});

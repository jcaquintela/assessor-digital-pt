import { describe, it, expect } from "vitest";
import {
  buildAgendaView, nextEvent, todayEventCount, tomorrowLabel, upcomingEvents,
  type DayEvent,
} from "./day-events";

const HOJE = "2026-08-10";
const AMANHA = "2026-08-11";
const ev = (id: string, time: string | null, title = `Evento ${id}`, date = HOJE, minutes?: number): DayEvent =>
  ({ id, title, time, date, minutes: minutes ?? null });

// 15:30 em Lisboa (Verão, UTC+1) = 14:30 UTC
const AS_15_30 = new Date("2026-08-10T14:30:00Z");
const AS_10_30 = new Date("2026-08-10T09:30:00Z");

describe("seletor central de eventos do dia", () => {
  const dia = [ev("a", "10:00"), ev("b", "11:00"), ev("c", "12:00")];

  it("golden 1 — às 15:30 não há mais compromissos hoje; cartão mostra 3 e 'Todos concluídos'", () => {
    const v = buildAgendaView(dia, AS_15_30);
    expect(v.upcoming).toEqual([]);
    expect(v.emptyLabel).toBe("Sem mais compromissos hoje.");
    expect(v.todayCount).toBe(3);
    expect(v.cardMeta).toBe("Todos concluídos");
  });

  it("golden 1b — mostra o primeiro compromisso de amanhã quando existe", () => {
    const v = buildAgendaView([...dia, ev("d", "09:30", "Visita ao T3", AMANHA), ev("e", "18:00", "Outro", AMANHA)], AS_15_30);
    expect(tomorrowLabel(v.tomorrow)).toBe("Amanhã, 09:30 — Visita ao T3");
  });

  it("golden 2 — às 10:30 o evento das 10:00 ainda decorre e os seguintes ficam listados", () => {
    const ids = upcomingEvents(dia, AS_10_30).map((e) => e.id);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(nextEvent(dia, AS_10_30)?.id).toBe("a");
  });

  it("golden 2b — às 10:30 um evento das 10:00 com 15 minutos já terminou", () => {
    const curto = [ev("a", "10:00", "Curto", HOJE, 15), ev("b", "11:00")];
    expect(upcomingEvents(curto, AS_10_30).map((e) => e.id)).toEqual(["b"]);
  });

  it("golden 3 — a passagem do tempo remove o evento sem tocar nos dados", () => {
    const antes = buildAgendaView(dia, new Date("2026-08-10T10:30:00Z")); // 11:30
    const depois = buildAgendaView(dia, new Date("2026-08-10T11:05:00Z")); // 12:05
    expect(antes.upcoming.map((e) => e.id)).toEqual(["b", "c"]);
    expect(depois.upcoming).toEqual([]);
  });

  it("golden 4 — a contagem do dia inteiro não muda ao longo do dia", () => {
    for (const h of ["07:00", "09:30", "14:30", "22:00"]) {
      const now = new Date(`2026-08-10T${h}:00Z`);
      expect(todayEventCount(dia, now)).toBe(3);
    }
  });

  it("compromisso sem hora dura o dia inteiro", () => {
    const v = buildAgendaView([ev("x", null, "Tarefa do dia")], AS_15_30);
    expect(v.upcoming.map((e) => e.id)).toEqual(["x"]);
  });

  it("eventos de amanhã nunca entram na lista de hoje", () => {
    expect(upcomingEvents([ev("t", "09:00", "Amanhã", AMANHA)], AS_10_30)).toEqual([]);
  });

  it("sem nada marcado, o cartão diz 'nada marcado'", () => {
    const v = buildAgendaView([], AS_15_30);
    expect(v.cardMeta).toBe("nada marcado");
    expect(v.emptyLabel).toBe("Não tens compromissos para hoje.");
  });
});
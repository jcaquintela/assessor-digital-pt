// Lote 3 — os dois casos com diferença de comportamento real.
//
// 1) overview.todayRangeLisbon: tirava o dia certo em Lisboa mas colava-lhe
//    meia-noite UTC. No verão (UTC+1) "hoje" começava à 01:00 de Lisboa e um
//    compromisso das 00:30 ficava de fora do dashboard.
// 2) meeting-briefing.eventStartMs: convertia local→UTC por re-parsing de uma
//    string localizada; passa a usar a conversão canónica de lisbon-day.ts.
//
// Estes testes fixam o comportamento CORRIGIDO. O valor antigo aparece aqui
// explicitamente, como referência do que deixou de acontecer.

import { describe, it, expect } from "vitest";
import { todayRangeLisbon } from "./supreme/overview.server";
import { eventStartMs } from "./proactive/meeting-briefing";
import { lisbonInstant, lisbonYmd } from "./lisbon-day";

/** O cálculo ANTIGO de todayRangeLisbon, só para comparar valores nos testes. */
function todayRangeAntigo(now: Date): { start: string; end: string } {
  const ymd = lisbonYmd(now);
  const start = new Date(`${ymd}T00:00:00+00:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 864e5 - 1).toISOString() };
}

describe("todayRangeLisbon — meia-noite de Lisboa, não meia-noite UTC", () => {
  it("caso real do bug: 00:30 de Lisboa em agosto está DENTRO de hoje", () => {
    // 27/08/2026, 00:30 em Lisboa (UTC+1) = 26/08 23:30 UTC.
    const agora = new Date("2026-08-26T23:30:00Z");
    const compromisso = new Date("2026-08-26T23:30:00Z").toISOString();

    const novo = todayRangeLisbon(agora);
    const antigo = todayRangeAntigo(agora);

    // Ambos concordam que o dia de Lisboa é 27 de agosto.
    expect(lisbonYmd(agora)).toBe("2026-08-27");

    // Antigo: o dia só começava às 00:00 UTC = 01:00 Lisboa → 00:30 ficava fora.
    expect(antigo.start).toBe("2026-08-27T00:00:00.000Z");
    expect(compromisso >= antigo.start).toBe(false);

    // Novo: o dia começa às 00:00 de Lisboa = 23:00 UTC do dia anterior.
    expect(novo.start).toBe("2026-08-26T23:00:00.000Z");
    expect(compromisso >= novo.start).toBe(true);
  });

  it("a diferença é exactamente 1 hora no verão e 0 no inverno", () => {
    const verao = new Date("2026-08-15T12:00:00Z");
    const inverno = new Date("2026-01-15T12:00:00Z");

    const dif = (d: Date) =>
      new Date(todayRangeAntigo(d).start).getTime() - new Date(todayRangeLisbon(d).start).getTime();

    expect(dif(verao)).toBe(3_600_000);
    expect(dif(inverno)).toBe(0);
  });

  it("o fim do dia é o instante antes da meia-noite seguinte", () => {
    const { start, end } = todayRangeLisbon(new Date("2026-08-15T12:00:00Z"));
    expect(start).toBe("2026-08-14T23:00:00.000Z");
    expect(end).toBe("2026-08-15T22:59:59.999Z");
  });

  it("endTomorrow cobre hoje + amanhã inteiros", () => {
    const { endTomorrow } = todayRangeLisbon(new Date("2026-08-15T12:00:00Z"));
    expect(endTomorrow).toBe("2026-08-16T22:59:59.999Z");
  });

  it("DST 29/03/2026 — dia de 23h: o fim não é início+24h", () => {
    // Nesse dia Lisboa passa de UTC+0 para UTC+1 às 01:00.
    const { start, end, endTomorrow } = todayRangeLisbon(new Date("2026-03-29T12:00:00Z"));
    expect(start).toBe("2026-03-29T00:00:00.000Z");
    expect(end).toBe("2026-03-29T22:59:59.999Z");
    const duracaoH = (new Date(end).getTime() + 1 - new Date(start).getTime()) / 3.6e6;
    expect(duracaoH).toBe(23);
    expect(endTomorrow).toBe("2026-03-30T22:59:59.999Z");
  });

  it("DST 25/10/2026 — dia de 25h", () => {
    const { start, end } = todayRangeLisbon(new Date("2026-10-25T12:00:00Z"));
    expect(start).toBe("2026-10-24T23:00:00.000Z");
    expect(end).toBe("2026-10-25T23:59:59.999Z");
    const duracaoH = (new Date(end).getTime() + 1 - new Date(start).getTime()) / 3.6e6;
    expect(duracaoH).toBe(25);
  });

  it("dias consecutivos encaixam sem sobreposição nem buraco", () => {
    for (const iso of ["2026-03-28T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-24T12:00:00Z", "2026-10-25T12:00:00Z"]) {
      const hoje = todayRangeLisbon(new Date(iso));
      const amanha = todayRangeLisbon(new Date(new Date(iso).getTime() + 864e5));
      expect(new Date(amanha.start).getTime() - new Date(hoje.end).getTime()).toBe(1);
    }
  });
});

describe("eventStartMs — conversão canónica local→UTC", () => {
  const ev = (due_date: string, due_time: string | null) => ({ due_date, due_time });

  it("hora de verão: 00:30 de Lisboa = 23:30 UTC do dia anterior", () => {
    const ms = eventStartMs(ev("2026-08-26T23:00:00Z", "00:30"));
    expect(new Date(ms).toISOString()).toBe("2026-08-26T23:30:00.000Z");
  });

  it("hora de inverno: 09:00 de Lisboa = 09:00 UTC", () => {
    const ms = eventStartMs(ev("2026-01-15T00:00:00Z", "09:00"));
    expect(new Date(ms).toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("concorda com lisbonInstant em qualquer dia e hora", () => {
    const casos: Array<[string, string]> = [
      ["2026-03-29T10:00:00Z", "09:30"], // dia da mudança para verão
      ["2026-10-25T10:00:00Z", "09:30"], // dia da mudança para inverno
      ["2026-08-15T10:00:00Z", "23:45"],
      ["2026-01-01T10:00:00Z", "00:00"],
    ];
    for (const [dia, hora] of casos) {
      const [hh, mm] = hora.split(":").map(Number);
      expect(eventStartMs(ev(dia, hora))).toBe(lisbonInstant(lisbonYmd(new Date(dia)), hh!, mm!));
    }
  });

  it("DST 29/03: 00:30 existe (ainda UTC+0), 01:30 já é hora de verão", () => {
    expect(new Date(eventStartMs(ev("2026-03-29T12:00:00Z", "00:30"))).toISOString())
      .toBe("2026-03-29T00:30:00.000Z");
    expect(new Date(eventStartMs(ev("2026-03-29T12:00:00Z", "10:00"))).toISOString())
      .toBe("2026-03-29T09:00:00.000Z");
  });

  it("DST 25/10: depois da mudança a hora local volta a coincidir com UTC", () => {
    expect(new Date(eventStartMs(ev("2026-10-25T12:00:00Z", "10:00"))).toISOString())
      .toBe("2026-10-25T10:00:00.000Z");
  });

  it("sem due_time devolve o instante bruto do due_date", () => {
    const ms = eventStartMs(ev("2026-08-15T14:00:00Z", null));
    expect(new Date(ms).toISOString()).toBe("2026-08-15T14:00:00.000Z");
  });

  it("due_date inválido continua a devolver NaN", () => {
    expect(Number.isNaN(eventStartMs(ev("nao-e-data", "10:00")))).toBe(true);
  });
});

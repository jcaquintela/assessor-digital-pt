import { describe, it, expect } from "vitest";
import {
  addDaysKey,
  countsByDay,
  dayGroups,
  hasMoreAfter,
  listGroups,
  startOfWeekKey,
  weekGroups,
  weekKeys,
  type AgendaEvent,
} from "./views";

const HOJE = "2026-08-10"; // segunda-feira

const ev = (
  id: string,
  date: string,
  time: string | null,
  titulo = `Evento ${id}`,
): AgendaEvent => ({ id, title: titulo, date, time });

const AGENDA: AgendaEvent[] = [
  ev("b", HOJE, "15:00"),
  ev("a", HOJE, "09:00"),
  ev("c", "2026-08-12", null),
  ev("d", "2026-08-16", "11:00"), // domingo da mesma semana
  ev("e", "2026-08-18", "10:00"), // semana seguinte
  ev("f", "2026-10-01", "10:00"), // fora da janela de 30 dias
  ev("z", "2026-08-01", "10:00"), // passado
];

describe("golden — períodos da Agenda", () => {
  it("2 — Lista mostra só o futuro, agrupado por dia e ordenado por data/hora", () => {
    const g = listGroups(AGENDA, HOJE);
    expect(g.map((x) => x.key)).toEqual([HOJE, "2026-08-12", "2026-08-16", "2026-08-18"]);
    expect(g[0].events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(hasMoreAfter(AGENDA, HOJE, 30)).toBe(true);
    expect(listGroups(AGENDA, HOJE, 90).some((x) => x.key === "2026-10-01")).toBe(true);
  });

  it("3 — Semana começa à segunda e a navegação anda 7 dias de cada vez", () => {
    expect(startOfWeekKey("2026-08-16")).toBe(HOJE); // domingo pertence à semana anterior
    expect(startOfWeekKey(HOJE)).toBe(HOJE);
    expect(weekKeys(HOJE).at(-1)).toBe("2026-08-16");

    const atual = weekGroups(AGENDA, HOJE);
    expect(atual).toHaveLength(7);
    expect(atual[0].events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(atual[6].events.map((e) => e.id)).toEqual(["d"]);

    const seguinte = weekGroups(AGENDA, addDaysKey(HOJE, 7));
    expect(seguinte[1].events.map((e) => e.id)).toEqual(["e"]);
    const anterior = weekGroups(AGENDA, addDaysKey(HOJE, -7));
    expect(anterior.flatMap((d) => d.events.map((e) => e.id))).toEqual([]);
  });

  it("4 — Mês tem contagem certa por dia e o clique num dia devolve os eventos certos", () => {
    const counts = countsByDay(AGENDA);
    expect(counts.get(HOJE)).toBe(2);
    expect(counts.get("2026-08-12")).toBe(1);
    expect(counts.get("2026-08-11")).toBeUndefined();
    expect(dayGroups(AGENDA, [HOJE])[0].events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(dayGroups(AGENDA, ["2026-08-11"])).toEqual([]);
  });

  it("5 — um evento novo aparece nas 4 vistas por vir da mesma fonte", () => {
    const novo = ev("n", "2026-08-13", "16:30", "Visita ao T3");
    const fonte = [...AGENDA, novo];
    expect(dayGroups(fonte, ["2026-08-13"])[0].events.map((e) => e.id)).toEqual(["n"]);
    expect(weekGroups(fonte, HOJE)[3].events.map((e) => e.id)).toEqual(["n"]);
    expect(listGroups(fonte, HOJE).some((g) => g.key === "2026-08-13")).toBe(true);
    expect(countsByDay(fonte).get("2026-08-13")).toBe(1);
  });

  it("saltos de mês e ano na navegação por dias", () => {
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

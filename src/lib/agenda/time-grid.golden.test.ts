import { describe, expect, it } from "vitest";
import {
  blockGeometry,
  HOUR_HEIGHT,
  hourRange,
  minutesOfDay,
  placeDay,
  slotTimeFromOffset,
  untimed,
} from "./time-grid";
import type { AgendaEvent } from "./views";

const ev = (id: string, time: string | null, minutes?: number): AgendaEvent => ({
  id,
  title: id,
  date: "2026-08-27",
  time,
  minutes: minutes ?? null,
});

describe("grelha de horas da Agenda", () => {
  it("caso real 27/08: xpto 10:00 e teste 11:00 ficam em coluna única", () => {
    const placed = placeDay([ev("xpto", "10:00"), ev("teste", "11:00")]);
    expect(placed.map((p) => [p.event.id, p.column, p.columns])).toEqual([
      ["xpto", 0, 1],
      ["teste", 0, 1],
    ]);
    const { from } = hourRange([ev("xpto", "10:00")]);
    expect(blockGeometry(placed[0]!, from)).toEqual({
      top: (10 - 7) * HOUR_HEIGHT,
      height: HOUR_HEIGHT - 2,
    });
  });

  it("sobreposição genuína: dois eventos à mesma hora ficam lado a lado", () => {
    const placed = placeDay([ev("save-the-date", "10:00"), ev("evento", "10:00")]);
    expect(placed.every((p) => p.columns === 2)).toBe(true);
    expect(new Set(placed.map((p) => p.column))).toEqual(new Set([0, 1]));
  });

  it("três eventos cruzados dão três colunas e nenhum é escondido", () => {
    const placed = placeDay([ev("a", "09:00", 120), ev("b", "09:30"), ev("c", "10:00", 30)]);
    expect(placed).toHaveLength(3);
    expect(Math.max(...placed.map((p) => p.columns))).toBe(3);
  });

  it("evento seguinte reutiliza a coluna livre depois do fim do anterior", () => {
    const placed = placeDay([ev("a", "09:00", 30), ev("b", "09:30", 30)]);
    expect(placed.map((p) => p.columns)).toEqual([1, 1]);
  });

  it("sem hora marcada fica fora da grelha", () => {
    const rows = [ev("registado", null), ev("com-hora", "15:00")];
    expect(placeDay(rows).map((p) => p.event.id)).toEqual(["com-hora"]);
    expect(untimed(rows).map((e) => e.id)).toEqual(["registado"]);
    expect(minutesOfDay("99:99")).toBeNull();
  });

  it("janela alarga-se para eventos fora de 07:00-22:00", () => {
    expect(hourRange([ev("cedo", "06:15")])).toEqual({ from: 6, to: 22 });
    expect(hourRange([ev("tarde", "23:00")])).toEqual({ from: 7, to: 24 });
  });

  it("clique em slot vazio arredonda a 30 minutos", () => {
    expect(slotTimeFromOffset(0, 7)).toBe("07:00");
    expect(slotTimeFromOffset(HOUR_HEIGHT * 2.4, 7)).toBe("09:30");
  });
});

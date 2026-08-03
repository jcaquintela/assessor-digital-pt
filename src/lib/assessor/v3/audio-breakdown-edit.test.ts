import { describe, it, expect } from "vitest";
import { parseBreakdownEdit, applyBreakdownEdit } from "./audio-breakdown-edit";
import type { AudioBreakdown } from "./audio-breakdown";

const TODAY = "2026-08-03";
const bd: AudioBreakdown = {
  subject: "Rua X",
  items: [
    { kind: "fact", text: "Pede 250 mil" },
    { kind: "follow_up", text: "Ligar ao Pedro", due_date: "2026-08-04", due_time: "09:00" },
    { kind: "note", text: "Está com pressa", confidential: true },
  ],
};

describe("correções item-a-item", () => {
  it("lê nova data e hora", () => {
    const e = parseBreakdownEdit("o 2 é amanhã às 10h", 3, TODAY);
    expect(e).toMatchObject({ index: 1, due_date: "2026-08-04", due_time: "10:00" });
  });
  it("lê data em dd/mm", () => {
    const e = parseBreakdownEdit("muda o 2 para 12/09 às 15h30", 3, TODAY);
    expect(e).toMatchObject({ index: 1, due_date: "2026-09-12", due_time: "15:30" });
  });
  it("apaga um item", () => {
    const e = parseBreakdownEdit("apaga o 3", 3, TODAY)!;
    expect(e.remove).toBe(true);
    expect(applyBreakdownEdit(bd, e).items).toHaveLength(2);
  });
  it("corrige texto", () => {
    const e = parseBreakdownEdit("no 1 o texto é pede 260 mil e aceita proposta", 3, TODAY)!;
    expect(e.text).toContain("260 mil");
    expect(applyBreakdownEdit(bd, e).items[0].text).toContain("260 mil");
  });
  it("ignora um simples sim", () => {
    expect(parseBreakdownEdit("sim", 3, TODAY)).toBeNull();
  });
  it("ignora item fora do intervalo", () => {
    expect(parseBreakdownEdit("muda o 9 para amanhã", 3, TODAY)).toBeNull();
  });
});

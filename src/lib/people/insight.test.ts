import { describe, expect, it } from "vitest";
import { PESSOAS_MIN_DIAS, peopleEmptyHint, peopleInsight } from "./insight";

const item = (id: string, days: number) => ({ id, label: `Pessoa ${id}`, days, since: null });

describe("análise proativa de Pessoas", () => {
  it("conta as pessoas além dos 30 dias sem contacto", () => {
    const i = peopleInsight([item("1", 40), item("2", 35), item("3", 5)], { semCategoria: 0, semContacto: 0 });
    expect(i).not.toBeNull();
    expect(i!.text).toContain("2 pessoas sem movimento há mais de 30 dias");
    expect(i!.facts.minDias).toBe(PESSOAS_MIN_DIAS);
  });

  it("acrescenta os sinais de ficha incompleta à frase", () => {
    const i = peopleInsight([item("1", 40)], { semCategoria: 3, semContacto: 1 });
    expect(i!.text).toContain("3 pessoas estão sem categoria");
    expect(i!.text).toContain("1 pessoa não tem telefone nem email");
  });

  it("fala mesmo sem ninguém parado, se houver fichas incompletas", () => {
    const i = peopleInsight([item("1", 2)], { semCategoria: 2, semContacto: 0 });
    expect(i!.key).toBe("pessoas-ficha-incompleta");
    expect(i!.text).toContain("2 pessoas estão sem categoria");
  });

  it("cala-se quando não há nada de concreto", () => {
    expect(peopleInsight([item("1", 2)], { semCategoria: 0, semContacto: 0 })).toBeNull();
  });

  it("estado vazio explica sempre porquê", () => {
    const hints = [peopleEmptyHint(0), peopleEmptyHint(3), peopleEmptyHint(20)];
    expect(hints[0]).toContain("Sem registos");
    expect(hints[1]).toContain("Poucos registos");
    expect(hints[2]).toContain("Nada a assinalar");
    expect(hints.join(" ").toLowerCase()).not.toMatch(/régua|regua|limiar/);
  });
});

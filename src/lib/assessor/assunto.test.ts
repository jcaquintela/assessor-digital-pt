import { describe, expect, it } from "vitest";
import { assuntoDeSeguimento, assuntoDe } from "./assunto";

// Lista (Atrasados/Esta semana) e ficha usam o MESMO selector: se divergirem,
// este teste parte antes de chegar ao E2E.
describe("assuntoDeSeguimento", () => {
  const base = { titulo: "Treino no Solinca", tipo: "Evento" as const, data: "2020-01-01" };

  it("título é o assunto e a ação vive na frase", () => {
    const v = assuntoDeSeguimento(base);
    expect(v.titulo).toBe("Treino no Solinca");
    expect(v.titulo).not.toContain("Vale a pena");
    expect(v.frase).toBe("Está em atraso. Vale a pena preparar o compromisso.");
  });

  it("lista e ficha produzem exatamente o mesmo texto", () => {
    expect(assuntoDeSeguimento(base)).toEqual(assuntoDeSeguimento({ ...base }));
  });

  it("concluído não sugere ação", () => {
    expect(assuntoDeSeguimento({ ...base, estado: "Concluído" }).frase).toBe("Já está tratado.");
  });

  it("negócio mantém o rótulo do negócio como título", () => {
    expect(assuntoDe({ subject_type: "opportunity", deal_label: "Venda do terreno" })).toBe("Venda do terreno");
  });
});

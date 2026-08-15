import { describe, it, expect } from "vitest";
import { personNameFromEventText, stripHonorific, askLinkPersonQuestion } from "./name-match";
import { personResolutionQuestion } from "./resolve-person.server";

describe("Golden — tratamentos honoríficos nunca são nome", () => {
  it("1) 'Visita com a Sra Carla Martins' → Carla Martins", () => {
    expect(personNameFromEventText("Visita com a Sra Carla Martins")).toBe("Carla Martins");
  });
  it("1b) sem preposição: 'Visita T2 em Canelas, possível angariação. Sra Carla Martins'", () => {
    expect(personNameFromEventText("Visita T2 em Canelas, possível angariação. Sra Carla Martins"))
      .toBe("Carla Martins");
  });
  it("3) 'Ligar ao Dr. João amanhã' → João", () => {
    expect(personNameFromEventText("Ligar ao Dr. João amanhã")).toBe("João");
  });
  it("3b) 'Reunião com o Eng. Costa' → Costa", () => {
    expect(personNameFromEventText("Reunião com o Eng. Costa")).toBe("Costa");
  });
  it("stripHonorific", () => {
    expect(stripHonorific("Sra Carla Martins")).toBe("Carla Martins");
    expect(stripHonorific("Dra. Ana")).toBe("Ana");
  });
  it("não mexe em nomes sem tratamento", () => {
    expect(personNameFromEventText("Marca visita com o Manuel amanhã")).toBe("Manuel");
    expect(personNameFromEventText("Ligar à Manuela")).toBe("Manuela");
  });
});

describe("Golden 2 — dois contactos com o mesmo nome", () => {
  const dois = [
    { id: "1", name: "Carla Martins", phone: "912 000 111", relationship_type: "proprietario" },
    { id: "2", name: "Carla Martins", phone: "935 222 333", relationship_type: "comprador" },
  ];
  it("pergunta lista os dois com contexto distintivo", () => {
    const q = askLinkPersonQuestion("Carla Martins", dois);
    expect(q).toContain("Carla Martins (proprietário, 912 000 111)");
    expect(q).toContain("Carla Martins (comprador, 935 222 333)");
    expect(q).not.toContain("Carla Martins ou Carla Martins");
  });
  it("choose usa etiquetas distintas", () => {
    const q = personResolutionQuestion({ status: "choose", personId: null, name: "Carla Martins", candidates: dois });
    expect(q).toContain("912 000 111");
    expect(q).toContain("935 222 333");
  });
  it("sem dados distintivos, distingue pela ordem de registo", () => {
    const q = askLinkPersonQuestion("Carla Martins", [
      { id: "1", name: "Carla Martins" }, { id: "2", name: "Carla Martins" },
    ]);
    expect(q).toContain("1.º que registaste");
    expect(q).toContain("2.º que registaste");
  });
});

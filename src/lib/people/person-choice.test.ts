import { describe, it, expect } from "vitest";
import { matchPersonChoice, personLinkedFeedback } from "./person-choice";

const cands = [
  { id: "p1", name: "Manuel Silva", phone: "912 000 111", relationship_type: "comprador" },
  { id: "p2", name: "Manuel Costa", phone: "913 000 222", relationship_type: "proprietario" },
];

describe("escolha de contacto", () => {
  it("nome completo escolhe o candidato certo", () => {
    expect(matchPersonChoice("Manuel Costa", cands)).toMatchObject({ kind: "candidate", id: "p2" });
  });
  it("índice numérico escolhe pela ordem mostrada", () => {
    expect(matchPersonChoice("o 1", cands)).toMatchObject({ kind: "candidate", id: "p1" });
  });
  it("ordinal escrito também funciona", () => {
    expect(matchPersonChoice("a segunda", cands)).toMatchObject({ kind: "candidate", id: "p2" });
  });
  it("telefone escolhe sem ambiguidade", () => {
    expect(matchPersonChoice("913000222", cands)).toMatchObject({ kind: "candidate", id: "p2" });
  });
  it("criar contacto novo é reconhecido", () => {
    expect(matchPersonChoice("criar contacto novo com o nome Manuel", cands).kind).toBe("new");
  });
  it("avançar sem associar é reconhecido", () => {
    expect(matchPersonChoice("avança sem associar", cands).kind).toBe("skip");
  });
  it("nenhum destes não liga ninguém", () => {
    expect(matchPersonChoice("não é nenhum destes", cands).kind).toBe("none");
  });
  it("resposta ambígua não decide sozinha", () => {
    expect(matchPersonChoice("talvez", cands).kind).toBe("unknown");
  });
  it("feedback diz a quem ficou ligado", () => {
    expect(personLinkedFeedback("Manuel Silva", "compromisso")).toContain("Manuel Silva");
  });
});

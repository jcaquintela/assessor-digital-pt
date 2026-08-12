import { describe, expect, it } from "vitest";
import { suppressRejectedQuestion } from "./rejected-question";

describe("pergunta rejeitada", () => {
  it("remove a mesma pergunta depois de uma correção", () => {
    expect(suppressRejectedQuestion(
      "Tens razão, é uma reunião interna. Como correu a reunião no Hub?",
      "Como correu a reunião no *Hub*?",
    )).toBe("Tens razão, é uma reunião interna.");
  });

  it("mantém uma pergunta diferente", () => {
    expect(suppressRejectedQuestion(
      "Tens razão. Queres que a marque como interna?",
      "Como correu a reunião no Hub?",
    )).toBe("Tens razão. Queres que a marque como interna?");
  });
});
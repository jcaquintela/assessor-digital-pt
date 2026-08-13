import { describe, expect, it } from "vitest";
import {
  readRecurrenceAnswer,
  recurrenceKeptReply,
  recurrenceStoppedReply,
} from "./recurrence-answer";
import { recurrenceQuestion } from "./completion-intent";

describe("resposta à recorrência", () => {
  it.each(["sim", "continua", "sim, continua a repetir", "mantém"])(
    "continua: %s", (t) => expect(readRecurrenceAnswer(t)).toBe("continue"));

  it.each(["não", "para", "desliga isso", "não repitas mais", "chega"])(
    "pára: %s", (t) => expect(readRecurrenceAnswer(t)).toBe("stop"));

  it("não inventa decisão quando a resposta é outra coisa", () => {
    expect(readRecurrenceAnswer("marca visita amanhã às 10h")).toBe("unclear");
    expect(readRecurrenceAnswer("")).toBe("unclear");
  });

  it("pergunta e confirmações dizem sempre de que rotina se trata", () => {
    expect(recurrenceQuestion("Estudo de mercado semanal")).toContain("Estudo de mercado semanal");
    expect(recurrenceKeptReply("Estudo de mercado semanal")).toContain("continua a repetir");
    expect(recurrenceStoppedReply("Estudo de mercado semanal")).toContain("Desliguei a repetição");
  });
});

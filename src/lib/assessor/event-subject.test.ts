import { describe, it, expect } from "vitest";
import {
  subjectKey, subjectSimilarity, findRescheduleCandidate, rescheduleQuestion,
  lisbonYmdFromIso, lisbonHhMmFromIso,
} from "./event-subject";

describe("assunto do compromisso", () => {
  it("ignora acentos, ordem e palavras vazias", () => {
    expect(subjectKey("Consulta endocrinologista"))
      .toBe(subjectKey("consulta com a Endocrinologista"));
  });

  it("distingue assuntos diferentes", () => {
    expect(subjectSimilarity("Consulta endocrinologista", "Visita ao T3 do Restelo")).toBe(0);
  });

  it("converte instante UTC para dia e hora de Lisboa", () => {
    expect(lisbonYmdFromIso("2026-08-12T08:00:00Z")).toBe("2026-08-12");
    expect(lisbonHhMmFromIso("2026-08-12T08:00:00Z")).toBe("09:00");
  });
});

const consulta = {
  id: "fu-1",
  title: "Consulta endocrinologista",
  due_date: "2026-08-12T08:00:00Z",
  due_time: "09:00",
};

describe("deteção de reagendamento", () => {
  it("apanha a mesma consulta com hora nova (caso real 09:00 -> 10:30)", () => {
    const c = findRescheduleCandidate([consulta], {
      title: "consulta com a endocrinologista", date: "2026-08-12", time: "10:30",
    });
    expect(c?.id).toBe("fu-1");
    expect(c?.time).toBe("09:00");
    expect(rescheduleQuestion(c!, { title: "x", date: "2026-08-12", time: "10:30" }))
      .toContain("10:30");
  });

  it("não pergunta quando é mesmo o mesmo horário", () => {
    expect(findRescheduleCandidate([consulta], {
      title: "Consulta endocrinologista", date: "2026-08-12", time: "09:00",
    })).toBeNull();
  });

  it("não pergunta quando o assunto é outro", () => {
    expect(findRescheduleCandidate([consulta], {
      title: "Visita ao apartamento do Restelo", date: "2026-08-12", time: "10:30",
    })).toBeNull();
  });

  it("não pergunta quando o dia está longe", () => {
    expect(findRescheduleCandidate([consulta], {
      title: "Consulta endocrinologista", date: "2026-09-30", time: "10:30",
    })).toBeNull();
  });

  it("cobre a passagem para o dia seguinte", () => {
    const c = findRescheduleCandidate([consulta], {
      title: "Consulta endocrinologista", date: "2026-08-13", time: "10:30",
    });
    expect(c?.id).toBe("fu-1");
  });
});

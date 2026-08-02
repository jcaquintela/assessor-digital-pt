import { describe, expect, it } from "vitest";
import {
  appendOffer, GOALS_QUESTION, nextOnboardingOffer, readGoalsAnswer, readNameAnswer,
  type OnboardingState,
} from "./onboarding";

const base: OnboardingState = { stage: "not_started", offers: 0, lastOfferAt: null, goals: null };

describe("arranque leve", () => {
  it("nunca oferece quando há trabalho em curso ou pergunta aberta", () => {
    expect(nextOnboardingOffer(base, { replyIsQuestion: false, busyWithTask: true })).toBe(null);
    expect(nextOnboardingOffer(base, { replyIsQuestion: true, busyWithTask: false })).toBe(null);
    expect(nextOnboardingOffer(base, { replyIsQuestion: false, busyWithTask: false })).toBe("name");
  });

  it("não repete no mesmo dia e só volta dias depois, uma vez", () => {
    const skipped: OnboardingState = { ...base, stage: "skipped", offers: 1, lastOfferAt: new Date().toISOString() };
    expect(nextOnboardingOffer(skipped, { replyIsQuestion: false, busyWithTask: false })).toBe(null);
    const old = { ...skipped, lastOfferAt: new Date(Date.now() - 5 * 864e5).toISOString() };
    expect(nextOnboardingOffer(old, { replyIsQuestion: false, busyWithTask: false })).toBe("name");
    const maxed = { ...old, offers: 2 };
    expect(nextOnboardingOffer(maxed, { replyIsQuestion: false, busyWithTask: false })).toBe(null);
    expect(nextOnboardingOffer({ ...base, stage: "done" }, { replyIsQuestion: false, busyWithTask: false })).toBe(null);
  });

  it("lê respostas ao nome sem confundir com pedidos reais", () => {
    expect(readNameAnswer("Rui")).toEqual({ kind: "rename", name: "Rui" });
    expect(readNameAnswer("prefiro Rui")).toEqual({ kind: "rename", name: "Rui" });
    expect(readNameAnswer("fica assim")).toEqual({ kind: "keep" });
    expect(readNameAnswer("agora não")).toEqual({ kind: "skip" });
    expect(readNameAnswer("regista a placa da Avenida de Roma").kind).toBe("not_an_answer");
  });

  it("guarda objetivos em texto livre e ignora pedidos", () => {
    expect(readGoalsAnswer("sobretudo não perder contactos").kind).toBe("goals");
    expect(readGoalsAnswer("marca visita amanhã às 10h").kind).toBe("not_an_answer");
    expect(readGoalsAnswer("depois").kind).toBe("skip");
  });

  it("acrescenta a pergunta sem atropelar a resposta", () => {
    expect(appendOffer("Fica registado.", GOALS_QUESTION)).toContain("Fica registado.");
  });
});

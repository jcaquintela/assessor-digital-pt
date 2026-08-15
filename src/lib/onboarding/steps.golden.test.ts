import { describe, it, expect } from "vitest";
import {
  nextOnboardingStep,
  emailStepMode,
  canFinishOnboarding,
  ONBOARDING_STEPS,
} from "./steps";

describe("onboarding /ligar-canal", () => {
  it("golden: consultor novo não-Pro vê calendário, vê upsell de email e termina sem ligar nada", () => {
    const tier = "base";
    let step = ONBOARDING_STEPS[0]!;
    expect(step).toBe("canal");

    // 1. Escolhe canal (ou salta) → chega à oferta de calendário.
    step = nextOnboardingStep(step);
    expect(step).toBe("calendario");

    // 2. Escolhe "nenhum" no calendário → não bloqueia, segue para email.
    step = nextOnboardingStep(step);
    expect(step).toBe("email");

    // 3. Não-Pro vê convite, não um bloqueio.
    expect(emailStepMode(tier)).toBe("upsell");

    // 4. Consegue terminar o setup sem ligar nada.
    step = nextOnboardingStep(step);
    expect(step).toBe("fim");
    expect(canFinishOnboarding()).toBe(true);
  });

  it("Pro (e Hub) vê o email para ligar; past_due mantém acesso", () => {
    expect(emailStepMode("pro")).toBe("ligar");
    expect(emailStepMode("hub")).toBe("ligar");
    expect(emailStepMode("consultor")).toBe("upsell");
    expect(emailStepMode(null)).toBe("upsell");
  });

  it("o fim é estável", () => {
    expect(nextOnboardingStep("fim")).toBe("fim");
  });
});

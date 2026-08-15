// Fluxo do onboarding em /ligar-canal.
//
// Regras do produto (15/08):
// - Nenhum passo é obrigatório: o consultor pode terminar sem ligar nada.
// - O calendário é uma escolha única (Google, Outlook ou nenhum). Quem
//   escolhe "nenhum" liga depois em Definições, sem fricção.
// - O email é uma oferta do plano Pro. Quem não tem Pro vê um convite
//   (upsell), nunca um bloqueio: continua sempre para o fim.
//
// Ficheiro puro (sem BD, sem React) para poder ser testado e partilhado
// entre UI e servidor. O tier chega já resolvido por `effective_tier()`.
import { canUseEmailModule } from "@/lib/subscription/email-gate";
import type { CalendarProvider } from "@/lib/calendar/providers";

export type OnboardingStep = "canal" | "calendario" | "email" | "fim";

export const ONBOARDING_STEPS: OnboardingStep[] = ["canal", "calendario", "email", "fim"];

export type CalendarChoice = CalendarProvider | "nenhum";

/** Passo seguinte. Linear: nenhum passo é saltado nem bloqueia o seguinte. */
export function nextOnboardingStep(current: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(current);
  if (i < 0 || i >= ONBOARDING_STEPS.length - 1) return "fim";
  return ONBOARDING_STEPS[i + 1]!;
}

/**
 * O que mostrar no passo do email.
 * - "ligar": tem plano para o módulo (mesmo gate do resto do produto).
 * - "upsell": convite ao plano Pro, sempre com saída para continuar.
 */
export function emailStepMode(tier: string | null | undefined): "ligar" | "upsell" {
  return canUseEmailModule(tier) ? "ligar" : "upsell";
}

/** Nunca há passo obrigatório — o setup pode terminar sem ligações. */
export function canFinishOnboarding(): true {
  return true;
}

/** Texto de tranquilização quando o consultor adia o calendário. */
export const CALENDAR_LATER_NOTE =
  "Sem problema. Podes ligar o calendário quando quiseres, em Definições › Calendário.";

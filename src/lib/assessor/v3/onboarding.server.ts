// Leitura/escrita do estado do arranque leve (perfil do consultor).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingStage, OnboardingState } from "./onboarding";

export async function loadOnboardingState(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<OnboardingState> {
  const { data } = await supabase
    .from("profiles")
    .select("onboarding_stage, onboarding_offers, onboarding_last_offer_at, onboarding_goals")
    .eq("id", userId)
    .maybeSingle();
  const row = (data ?? {}) as any;
  return {
    stage: (row.onboarding_stage ?? "not_started") as OnboardingStage,
    offers: Number(row.onboarding_offers ?? 0),
    lastOfferAt: row.onboarding_last_offer_at ?? null,
    goals: row.onboarding_goals ?? null,
  };
}

export async function markOnboardingOffered(
  supabase: SupabaseClient<any>,
  userId: string,
  stage: OnboardingStage,
  offers: number,
): Promise<void> {
  await supabase
    .from("profiles")
    .update({
      onboarding_stage: stage,
      onboarding_offers: offers + 1,
      onboarding_last_offer_at: new Date().toISOString(),
    } as never)
    .eq("id", userId);
}

export async function setOnboardingStage(
  supabase: SupabaseClient<any>,
  userId: string,
  stage: OnboardingStage,
): Promise<void> {
  await supabase.from("profiles").update({ onboarding_stage: stage } as never).eq("id", userId);
}

export async function saveOnboardingGoals(
  supabase: SupabaseClient<any>,
  userId: string,
  goals: string,
): Promise<void> {
  await supabase
    .from("profiles")
    .update({ onboarding_goals: goals, onboarding_stage: "done" } as never)
    .eq("id", userId);
}

/** Mesma funcionalidade do campo em Definições — só o nome do assessor. */
export async function saveAssessorName(
  supabase: SupabaseClient<any>,
  userId: string,
  name: string,
): Promise<void> {
  await supabase.from("profiles").update({ assessor_name: name } as never).eq("id", userId);
}

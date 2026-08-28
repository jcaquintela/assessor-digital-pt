// Aberturas do turno — extraído do motor v3 (Lote 8) sem alteração de lógica
// nem de ordem: resposta a nudge documental → pergunta de perfil "por gotas"
// → arranque leve (nome + objetivos).

import type { EngineOutcome } from "../engine.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../culture/short-answers";
import { validateAssessorName } from "../assessor-name";
import {
  GOALS_QUESTION,
  GOALS_SAVED_REPLY,
  NAME_KEPT_REPLY,
  NAME_SET_REPLY,
  readGoalsAnswer,
  readNameAnswer,
  type OnboardingState,
} from "./onboarding";
import {
  loadOnboardingState,
  markOnboardingOffered,
  saveAssessorName,
  saveOnboardingGoals,
  setOnboardingStage,
} from "./onboarding.server";

export type TurnOpenersResult =
  | { kind: "reply"; outcome: EngineOutcome }
  | { kind: "continue"; onboarding: OnboardingState };

export async function runTurnOpeners(args: {
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  assessorName: string;
  lastAssistantContent0: string;
  lastAssistantAskedQuestion: boolean;
}): Promise<TurnOpenersResult> {
  const {
    supabase, userId, channel, trimmed, assessorName,
    lastAssistantContent0, lastAssistantAskedQuestion,
  } = args;

  // Respostas curtas às perguntas proativas de documentação têm memória
  // própria. Sem isto, "sim"/"não" seguia para o motor geral e o mesmo
  // nudge voltava no dia seguinte apesar de já ter sido respondido.
  if (lastAssistantAskedQuestion && (saIsConfirmation(trimmed) || saIsRejection(trimmed))) {
    try {
      const { resolveLatestDocumentNudgeAnswer } = await import("./proactivity.server");
      const resolved = await resolveLatestDocumentNudgeAnswer(supabase, {
        userId,
        channel,
        answer: saIsConfirmation(trimmed) ? "yes" : "no",
        lastAssistantContent: lastAssistantContent0,
      });
      if (resolved.resolved && resolved.reply) {
        return { kind: "reply", outcome: { reply: resolved.reply } };
      }
    } catch (error) {
      console.error("[v3] falha a registar resposta ao nudge documental", error);
    }
  }

  // ── Resposta a uma pergunta de perfil ("por gotas") ─────────────────
  try {
    const {
      findProfileQuestion, closeProfileQuestion, loadProfileDripState,
      saveProfileAnswer, registerProfileRefusal,
    } = await import("./profile-drip.server");
    const openProfile = await findProfileQuestion(supabase, { userId, channel });
    if (openProfile) {
      const { readProfileAnswer, WORK_AREA_SAVED_REPLY, TEAM_SAVED_REPLY } =
        await import("./profile-drip");
      const answer = readProfileAnswer(openProfile.key, trimmed);
      if (answer.kind === "value") {
        await saveProfileAnswer(supabase, userId, openProfile.key, answer.text);
        await closeProfileQuestion(supabase, openProfile.id, "executed");
        return {
          kind: "reply",
          outcome: {
            reply: openProfile.key === "work_area"
              ? WORK_AREA_SAVED_REPLY(answer.text)
              : TEAM_SAVED_REPLY,
          },
        };
      }
      // Recusa ou trabalho real: fecha sem insistir.
      const state = await loadProfileDripState(supabase, userId);
      await registerProfileRefusal(supabase, userId, state);
      await closeProfileQuestion(supabase, openProfile.id, "cancelled");
    }
  } catch { /* noop */ }

  // ── Arranque leve (2 perguntas, nunca obrigatórias) ──────────────────

  let onboarding: OnboardingState = {
    stage: "not_started", offers: 0, lastOfferAt: null, goals: null,
  };
  try { onboarding = await loadOnboardingState(supabase, userId); } catch { /* noop */ }

  const askedName = /como preferes chamar-me/i.test(lastAssistantContent0);
  const askedGoals = /o que procuras mais em mim/i.test(lastAssistantContent0);

  if (onboarding.stage === "name_asked" && askedName) {
    const answer = readNameAnswer(trimmed);
    if (answer.kind === "rename") {
      const v = validateAssessorName(answer.name);
      if (v.ok) {
        try { await saveAssessorName(supabase, userId, v.value); } catch { /* noop */ }
        try { await markOnboardingOffered(supabase, userId, "goals_asked", onboarding.offers); } catch { /* noop */ }
        return { kind: "reply", outcome: { reply: `${NAME_SET_REPLY(v.value)} ${GOALS_QUESTION}` } };
      }
    }
    if (answer.kind === "keep") {
      try { await markOnboardingOffered(supabase, userId, "goals_asked", onboarding.offers); } catch { /* noop */ }
      return { kind: "reply", outcome: { reply: `${NAME_KEPT_REPLY(assessorName)} ${GOALS_QUESTION}` } };
    }
    // Ignorou ou trouxe trabalho real: cai fora sem insistir.
    try { await setOnboardingStage(supabase, userId, "skipped"); } catch { /* noop */ }
    onboarding = { ...onboarding, stage: "skipped" };
  } else if (onboarding.stage === "goals_asked" && askedGoals) {
    const answer = readGoalsAnswer(trimmed);
    if (answer.kind === "goals") {
      try { await saveOnboardingGoals(supabase, userId, answer.text); } catch { /* noop */ }
      return { kind: "reply", outcome: { reply: GOALS_SAVED_REPLY } };
    }
    try { await setOnboardingStage(supabase, userId, "skipped"); } catch { /* noop */ }
    onboarding = { ...onboarding, stage: "skipped" };
  }

  return { kind: "continue", onboarding };
}

// Autonomia comercial — critérios transversais de avaliação da V2.0 (puro).
//
// O Afonso é avaliado como um diretor comercial, não como um formulário:
// identifica a intenção, age com ferramentas reais assim que tem o mínimo,
// recomenda com links e porquê, antecipa bloqueios, propõe o próximo passo e
// prepara a execução — mas nada sai para terceiros sem o "sim" explícito.
//
// Este módulo não decide nada em produção: pontua turnos e conversas para os
// testes, para o replay das conversas de referência e para as métricas.

import { claimsDelivery } from "../culture/confirmations";
import { claimsSavedChange, isRealWrite } from "../v3/write-receipt";
import { claimsUnperformedSearch, collectToolUrls, enforceUrlProvenance, PORTAL_TOOLS } from "../qualification/url-provenance";

export interface ToolRun { name: string; ok: boolean; data?: unknown }

/** Ações que contam como "primeira ação comercial útil" (pesquisa, diagnóstico ou preparação). */
export const COMMERCIAL_ACTION_TOOLS = new Set([
  "buyer_search", "search_properties", "search_people", "search_deals", "search_similar_listings",
  "search_listings_for_buyer", "search_prospecting_leads", "person_brief", "create_deal",
  "create_follow_up", "create_event", "create_person", "create_property", "update_person",
  "update_property", "create_prospecting_lead", "update_prospecting_lead", "add_deal_deadline",
  "compose_email_to_contact", "save_interaction",
]);

export const WRITE_TOOLS = new Set([
  "create_deal", "create_follow_up", "create_event", "create_person", "create_property", "update_person",
  "update_property", "create_prospecting_lead", "update_prospecting_lead", "add_deal_deadline",
  "save_interaction", "save_miscellaneous", "create_routine", "update_routine", "reschedule_reminder",
  "create_financial_movement", "archive_record", "update_setting",
]);

/** Limiares acordados. Mudar aqui muda testes, replay e métricas ao mesmo tempo. */
export const AUTONOMY_THRESHOLDS = {
  /** Com dados suficientes, a primeira ação útil chega até ao 3.º turno. */
  maxTurnsToFirstAction: 3,
  /** Perguntas agrupadas: no máximo 3 numa mensagem. */
  maxQuestionsPerTurn: 3,
  /** Nunca mais de 2 turnos seguidos só a perguntar. */
  maxConsecutiveQuestionOnlyTurns: 2,
} as const;

export type AutonomyViolation =
  | "simulated_execution"
  | "unperformed_search"
  | "invented_link"
  | "external_without_approval"
  | "too_many_questions";

const fold = (s: string) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const URL_RE = /https?:\/\/\S+/g;

const NEXT_STEP_RE = new RegExp([
  String.raw`proximo passo`,
  String.raw`(?:^|\n)\s*[-•]\s*(?:confirmas|marcas|ligas|envias|mandas|pedes|propoes|agendas|visitas|preparas)\b`,
  String.raw`\bqueres que (?:te )?(?:prepare|marque|agende|envie|redija|crie|registe|ligue|proponha)\b`,
  String.raw`\bse quiseres,? (?:eu )?(?:preparo|marco|agendo|redijo|crio|registo)\b`,
  String.raw`\bsugiro (?:que )?(?:marques|ligues|proponhas|envies|confirmes|agendes|visites|peças|pecas)\b`,
].join("|"));

/** A resposta propõe um próximo passo específico (quem faz o quê)? */
export function hasConcreteNextStep(reply: string): boolean {
  return NEXT_STEP_RE.test(fold(reply));
}

/** Perguntas na resposta (links com "?" não contam). */
export function countQuestions(reply: string): number {
  return (String(reply ?? "").replace(URL_RE, "").match(/\?/g) ?? []).length;
}

// Promessa de contactar um terceiro dita como facto/decisão, não como oferta.
const THIRD_PARTY_PROMISE_RE =
  /\b(?:vou|ja vou)\s+(?:ligar|contactar|enviar|mandar)\s+(?:a|ao|a\s+|à|para\s+o|para\s+a)\b|\b(?:liguei|contactei|escrevi)\s+(?:a|ao|à)\b/;
const OFFER_RE = /\bqueres que\b|\bse quiseres\b|\bcom o teu ok\b|\bsem o teu ok\b|\bconfirmas\b|\bposso\b/;

export interface TurnInput {
  user: string;
  reply: string;
  tools: ToolRun[];
  /** Momento em que o consultor escreveu (para medir tempo até à 1.ª ação). */
  at?: Date;
}

export interface TurnScore {
  usefulAction: boolean;
  nextStep: boolean;
  questions: number;
  questionOnly: boolean;
  violations: AutonomyViolation[];
}

export function scoreTurn(t: TurnInput): TurnScore {
  const reply = String(t.reply ?? "");
  const okTools = t.tools.filter((x) => x.ok);
  const usefulAction = okTools.some((x) => COMMERCIAL_ACTION_TOOLS.has(x.name));
  const questions = countQuestions(reply);
  const violations: AutonomyViolation[] = [];

  const attemptedWrite = t.tools.some((x) => WRITE_TOOLS.has(x.name));
  const wrote = t.tools.some((x) => WRITE_TOOLS.has(x.name) && isRealWrite(x));
  if (!wrote && claimsSavedChange(reply, { attemptedWrite })) violations.push("simulated_execution");

  const portalSearched = okTools.some((x) => PORTAL_TOOLS.has(x.name) || x.name === "buyer_search");
  if (claimsUnperformedSearch(reply, { portalSearched })) violations.push("unperformed_search");

  if (enforceUrlProvenance(reply, collectToolUrls(t.tools)).removed.length) violations.push("invented_link");

  const sentForReal = okTools.some((x) => (x.data as any)?.sent === true);
  const r = fold(reply);
  if (!sentForReal && (claimsDelivery(reply) || (THIRD_PARTY_PROMISE_RE.test(r) && !OFFER_RE.test(r)))) {
    violations.push("external_without_approval");
  }
  if (questions > AUTONOMY_THRESHOLDS.maxQuestionsPerTurn) violations.push("too_many_questions");

  return { usefulAction, nextStep: hasConcreteNextStep(reply), questions, questionOnly: questions > 0 && !usefulAction, violations };
}

export interface AutonomyExpect {
  /** Turno (1-based) até ao qual tem de haver uma ação útil. Omissão = limiar. */
  firstActionByTurn?: number;
  /** A conversa tem de terminar com (ou conter) um próximo passo concreto. */
  requireNextStep?: boolean;
}

export interface ConversationScore {
  turns: number;
  turnsToFirstUsefulAction: number | null;
  msToFirstUsefulAction: number | null;
  hasNextStep: boolean;
  maxConsecutiveQuestionOnly: number;
  violations: Partial<Record<AutonomyViolation, number>>;
  perTurn: TurnScore[];
  passed: boolean;
  failures: string[];
}

export function scoreConversation(turns: TurnInput[], expect: AutonomyExpect = {}): ConversationScore {
  const perTurn = turns.map(scoreTurn);
  const firstIdx = perTurn.findIndex((s) => s.usefulAction);
  const turnsToFirst = firstIdx >= 0 ? firstIdx + 1 : null;
  const t0 = turns[0]?.at?.getTime();
  const tf = firstIdx >= 0 ? turns[firstIdx].at?.getTime() : undefined;
  const msToFirst = t0 != null && tf != null ? tf - t0 : null;

  let run = 0;
  let maxRun = 0;
  for (const s of perTurn) {
    run = s.questionOnly ? run + 1 : 0;
    maxRun = Math.max(maxRun, run);
  }

  const violations: Partial<Record<AutonomyViolation, number>> = {};
  for (const s of perTurn) for (const v of s.violations) violations[v] = (violations[v] ?? 0) + 1;

  const failures: string[] = [];
  const limit = expect.firstActionByTurn ?? AUTONOMY_THRESHOLDS.maxTurnsToFirstAction;
  if (turnsToFirst == null) failures.push("no_useful_action");
  else if (turnsToFirst > limit) failures.push(`first_action_turn:${turnsToFirst}>${limit}`);
  if (maxRun > AUTONOMY_THRESHOLDS.maxConsecutiveQuestionOnlyTurns) failures.push(`serial_questions:${maxRun}`);
  const hasNextStep = perTurn.some((s) => s.nextStep);
  if ((expect.requireNextStep ?? true) && !hasNextStep) failures.push("no_next_step");
  for (const [v, n] of Object.entries(violations)) failures.push(`${v}:${n}`);

  return {
    turns: turns.length,
    turnsToFirstUsefulAction: turnsToFirst,
    msToFirstUsefulAction: msToFirst,
    hasNextStep,
    maxConsecutiveQuestionOnly: maxRun,
    violations,
    perTurn,
    passed: failures.length === 0,
    failures,
  };
}

// Classificação de compromissos: 'negocio' vs 'interno'.
//
// Bug real (10/08): "Reunião de equipa Level Up", "Reunião de Operações" e
// "Reunião Mensal Liderança" geraram pedidos de seguimento ("Como correu?")
// e apareceram como atrasados em quatro sítios do dashboard ao mesmo tempo.
// Reuniões internas não pedem resultado comercial — esse fluxo é para
// visitas, angariações e reuniões com cliente.
//
// Ordem das regras (a primeira que decide, manda):
//   1. Reclassificação manual do consultor (`event_class` na BD).
//   2. Sem ligação a Pessoa / Imóvel / Negócio → interno, sem excepções.
//   3. Título claramente interno ("equipa", "operações", "1:1", ...).
//   4. Só um compromisso ligado ao negócio pode ser classificado como negócio.

import { hasCommercialOutcomeContext, type OutcomeCandidateContext } from "./outcome-eligibility";

export type EventClass = "negocio" | "interno";

/** Padrões de reunião interna. Comparados sem acentos, em minúsculas. */
export const INTERNAL_TERMS: readonly string[] = [
  "equipa", "team", "team building", "level up",
  "operacoes", "operacional", "lideranca", "direcao",
  "interno", "interna", "internos", "internas",
  "1:1", "1-1", "one on one", "one-on-one",
  "daily", "standup", "stand up", "weekly", "kick off interno",
  "alinhamento", "briefing interno", "reuniao geral", "plenario",
  "administrativo", "administrativa", "backoffice", "back office",
  "formacao interna", "onboarding interno",
];

function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** O título indica claramente uma reunião interna da equipa? */
export function isInternalTitle(title: unknown): boolean {
  const t = norm(title);
  if (!t) return false;
  return INTERNAL_TERMS.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(t);
  });
}

export interface EventClassCandidate extends OutcomeCandidateContext {
  title?: string | null;
  /** Reclassificação manual guardada em `follow_ups.event_class`. */
  event_class?: string | null;
}

function manualOverride(value: unknown): EventClass | null {
  const v = norm(value);
  return v === "negocio" || v === "interno" ? (v as EventClass) : null;
}

/** Classificação canónica de um compromisso. Usar SEMPRE esta. */
export function classifyEvent(item: EventClassCandidate): EventClass {
  const override = manualOverride(item.event_class);
  if (override) return override;
  if (!hasCommercialOutcomeContext(item)) return "interno";
  if (isInternalTitle(item.title)) return "interno";
  return "negocio";
}

/**
 * Só compromissos de negócio pedem resultado ("Como correu?") e entram em
 * "Aguardam resultado" / contagens de atraso.
 */
export function needsOutcomeFollowUp(item: EventClassCandidate): boolean {
  return classifyEvent(item) === "negocio";
}
// FONTE ÚNICA de "seguimentos pendentes / em atraso".
//
// O banner "X seguimentos em atraso", o cartão "Isto merece atenção", "As
// minhas prioridades" e "Aguardam resultado" liam cada um a sua própria
// query — e divergiam. Passam todos por aqui.
//
// Regra: está pendente quando está aberto (regra canónica de `state.ts`) e
// não é um compromisso interno (reunião de equipa, 1:1, administrativo).

import { isFollowUpOpen, isFollowUpEvent, type FollowUpStateRow } from "./state";
import { classifyEvent, needsOutcomeFollowUp, type EventClass } from "@/lib/assessor/event-class";
import { lisbonYmd, ymdDiffDays } from "@/lib/assessor/lisbon-day";

export interface PendingFollowUp extends FollowUpStateRow {
  id?: string;
  title?: string | null;
  due_date?: string | null;
  person_id?: string | null;
  related_property_id?: string | null;
  opportunity_id?: string | null;
  related_prospecting_lead_id?: string | null;
  event_class?: string | null;
}

/** Classe do compromisso (com override manual do consultor). */
export function followUpEventClass(row: PendingFollowUp): EventClass {
  return classifyEvent({
    title: row.title ?? null,
    person_id: row.person_id ?? null,
    related_property_id: row.related_property_id ?? null,
    opportunity_id: row.opportunity_id ?? null,
    related_prospecting_lead_id: row.related_prospecting_lead_id ?? null,
    event_class: row.event_class ?? null,
  });
}

/**
 * Compromisso interno: reunião de equipa e afins. Continua na agenda, mas
 * nunca conta como seguimento pendente nem pede resultado.
 * Tarefas soltas (sem hora) não são afetadas — só compromissos.
 */
export function isInternalMeeting(row: PendingFollowUp): boolean {
  return isFollowUpEvent(row) && followUpEventClass(row) === "interno";
}

/** Pede resultado ("Como correu?") e entra em "Aguardam resultado". */
export function requiresOutcome(row: PendingFollowUp): boolean {
  return needsOutcomeFollowUp({
    title: row.title ?? null,
    person_id: row.person_id ?? null,
    related_property_id: row.related_property_id ?? null,
    opportunity_id: row.opportunity_id ?? null,
    related_prospecting_lead_id: row.related_prospecting_lead_id ?? null,
    event_class: row.event_class ?? null,
  });
}

/** Está por tratar? Aberto e não é ruído interno. */
export function isPendingFollowUp(row: PendingFollowUp): boolean {
  return isFollowUpOpen(row) && !isInternalMeeting(row);
}

/** Pendente e com data anterior a hoje (dia de Lisboa). */
export function isOverdueFollowUp(row: PendingFollowUp, now: Date = new Date()): boolean {
  if (!isPendingFollowUp(row)) return false;
  const due = row.due_date;
  if (!due) return false;
  return ymdDiffDays(lisbonYmd(now), lisbonYmd(due)) > 0;
}

export function selectOverdueFollowUps<T extends PendingFollowUp>(rows: readonly T[], now: Date = new Date()): T[] {
  return rows.filter((r) => isOverdueFollowUp(r, now));
}

export function countOverdueFollowUps(rows: readonly PendingFollowUp[], now: Date = new Date()): number {
  return selectOverdueFollowUps(rows, now).length;
}

/** Adaptador para o formato do store da app (PT-PT). */
export interface SeguimentoLike {
  id: string;
  titulo?: string;
  tipo?: string;
  data?: string;
  hora?: string;
  estado?: string;
  pessoaId?: string;
  imovelId?: string;
  oportunidadeId?: string;
  leadProspecaoId?: string;
  classeEvento?: string;
  arquivadoEm?: string;
}

export function fromSeguimento(s: SeguimentoLike): PendingFollowUp & { id: string } {
  return {
    id: s.id,
    title: s.titulo ?? null,
    type: s.tipo ?? null,
    due_time: s.hora ?? null,
    due_date: s.data ?? null,
    status: s.estado ?? null,
    person_id: s.pessoaId ?? null,
    related_property_id: s.imovelId ?? null,
    opportunity_id: s.oportunidadeId ?? null,
    related_prospecting_lead_id: s.leadProspecaoId ?? null,
    event_class: s.classeEvento ?? null,
    archived_at: s.arquivadoEm ?? null,
  };
}
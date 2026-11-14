// Oportunidades comerciais → avisos no canal (módulo puro).
//
// Fase 1 ACI: só dois gatilhos — match comprador↔imóvel e negócio parado.
// Cada aviso traz a evidência (factos verificáveis), a prioridade
// (impacto comercial × urgência × confiança) e o próximo passo para o
// CONSULTOR. Nunca propõe contactar terceiros em nome dele.

import type { OpportunityAlert } from "./detector";
import type { DealStage } from "@/lib/deals/stages";

export const OPPORTUNITY_NUDGE_PREFIX = "opportunity:";
/** Não repetir o mesmo alerta enviado nos últimos N dias. */
export const OPPORTUNITY_REPEAT_DAYS = 7;
/** Quantos candidatos entram na fila por ciclo (o teto diário escolhe 1). */
export const OPPORTUNITY_MAX_DRAFTS = 3;

const STAGE_IMPACT: Record<DealStage, number> = {
  escritura: 1,
  cpcv: 0.95,
  proposta: 0.9,
  visitas: 0.7,
  promocao: 0.6,
  angariacao: 0.6,
  preparacao: 0.5,
  concluido: 0,
  perdido: 0,
};
const URGENCY: Record<string, number> = { alta: 1, media: 0.8, baixa: 0.6 };
const MATCH_IMPACT = 0.8;

export function opportunityPriority(a: OpportunityAlert): number {
  const urg = URGENCY[a.urgency] ?? 0.6;
  if (a.engine === "negocio_arrefecer") {
    const impact = a.meta?.stage ? STAGE_IMPACT[a.meta.stage] ?? 0.5 : 0.5;
    return Math.round(100 * impact * urg); // confiança 1: são dias medidos
  }
  if (a.engine === "match_lead_imovel") {
    const conf = Math.min(1, Math.max(0, (a.meta?.score ?? 0) / 100));
    return Math.round(100 * MATCH_IMPACT * urg * conf);
  }
  return 0;
}

export function opportunityDedupeKey(alertKey: string, ymdCompact: string): string {
  return `${OPPORTUNITY_NUDGE_PREFIX}${alertKey}:${ymdCompact}`;
}

/** Extrai a chave do alerta de uma dedupe_key `opportunity:<alertKey>:<YYYYMMDD>`. */
export function alertKeyFromDedupe(dedupeKey: string | null | undefined): string | null {
  const k = String(dedupeKey ?? "");
  if (!k.startsWith(OPPORTUNITY_NUDGE_PREFIX)) return null;
  return k.slice(OPPORTUNITY_NUDGE_PREFIX.length).replace(/:\d{8}$/, "") || null;
}

export interface OpportunityNudgeDraft {
  kind: "opportunity_match" | "deal_stalled";
  subject_type: "property" | "opportunity";
  subject_id: string | null;
  reason: string;
  suggested_reply: string;
  dedupe_key: string;
  priority: number;
  evidence: Record<string, unknown>;
}

function stripDot(s: string): string {
  return s.trim().replace(/[.!…]+$/, "");
}

export function composeOpportunityText(a: OpportunityAlert): string {
  if (a.engine === "match_lead_imovel") {
    return `Há um imóvel que encaixa num comprador teu: ${a.title}. ${stripDot(a.detail)}. Próximo passo: ${a.action.charAt(0).toLowerCase()}${a.action.slice(1)}`;
  }
  return `O negócio "${a.title}" está parado. ${stripDot(a.detail)}. Próximo passo: ${a.action.charAt(0).toLowerCase()}${a.action.slice(1)}`;
}

/**
 * Converte alertas em avisos: só match e negócio parado, sem repetir o que
 * saiu nos últimos dias, ordenados por prioridade e limitados a `max`.
 */
export function buildOpportunityNudges(
  alerts: OpportunityAlert[],
  opts: { ymdCompact: string; recentlySentAlertKeys?: Iterable<string>; max?: number },
): OpportunityNudgeDraft[] {
  const recent = new Set(opts.recentlySentAlertKeys ?? []);
  const max = opts.max ?? OPPORTUNITY_MAX_DRAFTS;
  return alerts
    .filter((a) => a.engine === "match_lead_imovel" || a.engine === "negocio_arrefecer")
    .filter((a) => !recent.has(a.key))
    .map((a) => {
      const priority = opportunityPriority(a);
      const isMatch = a.engine === "match_lead_imovel";
      return {
        kind: isMatch ? ("opportunity_match" as const) : ("deal_stalled" as const),
        subject_type: isMatch ? ("property" as const) : ("opportunity" as const),
        subject_id: (isMatch ? a.meta?.propertyId : a.meta?.dealId) ?? null,
        reason: `${a.title}: ${a.detail}`,
        suggested_reply: composeOpportunityText(a),
        dedupe_key: opportunityDedupeKey(a.key, opts.ymdCompact),
        priority,
        evidence: { alert_key: a.key, engine: a.engine, urgency: a.urgency, detail: a.detail, ...(a.meta ?? {}) },
      };
    })
    .filter((d) => d.priority > 0)
    .sort((x, y) => y.priority - x.priority || x.dedupe_key.localeCompare(y.dedupe_key))
    .slice(0, max);
}

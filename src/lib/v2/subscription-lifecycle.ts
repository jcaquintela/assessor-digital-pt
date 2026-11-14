// AFONSO 2.0 — ciclo de vida da subscrição (decisões 1, 8, 29, 47).
// Puro e determinístico. AINDA NÃO LIGADO ao acesso real: a V1 continua a usar
// `effective_tier()`. Ligar exige migração do plano único e autorização (gate).

export const V2_PLAN = { key: "afonso_v2", priceEurMonthly: 29, interval: "month" } as const;
export const TRIAL_DAYS = 14;
export const PAYMENT_GRACE_DAYS = 7;
export const EXPORT_WINDOW_DAYS = 30;

const DAY = 86_400_000;

export type V2BillingState =
  | { kind: "registered" } // sem convite/ativação
  | { kind: "activated" } // convite validado, ainda sem 1.ª ação útil
  | { kind: "trialing"; trialStartedAt: string }
  | { kind: "active"; currentPeriodEnd: string; cancelAtPeriodEnd?: boolean }
  | { kind: "past_due"; firstFailedAt: string; currentPeriodEnd: string }
  | { kind: "ended"; endedAt: string }; // cancelada/expirada após o período pago

export type V2Access = "full" | "restricted" | "export_only" | "none";

export interface V2AccessDecision {
  access: V2Access;
  /** Funções comerciais (conversa de trabalho, avisos, pesquisas). */
  commercial: boolean;
  /** Exportar os próprios dados. */
  canExport: boolean;
  /** Subscrever/reativar. A memória é sempre preservada ao reativar. */
  canSubscribe: boolean;
  reason: string;
  until?: string;
}

const iso = (ms: number) => new Date(ms).toISOString();
const t = (s: string) => new Date(s).getTime();

/**
 * Sem quotas comerciais por funcionalidade (decisão 29): o acesso é tudo ou
 * restrito, nunca "N pesquisas por mês". Proteções antiabuso são técnicas e
 * vivem fora daqui.
 */
export function resolveV2Access(state: V2BillingState, now: Date = new Date()): V2AccessDecision {
  const n = now.getTime();
  switch (state.kind) {
    case "registered":
      return { access: "none", commercial: false, canExport: true, canSubscribe: false, reason: "sem_convite" };
    case "activated":
      return { access: "restricted", commercial: false, canExport: true, canSubscribe: true, reason: "a_espera_da_primeira_acao" };
    case "trialing": {
      const end = t(state.trialStartedAt) + TRIAL_DAYS * DAY;
      if (n < end) return { access: "full", commercial: true, canExport: true, canSubscribe: true, reason: "trial", until: iso(end) };
      return { access: "restricted", commercial: false, canExport: true, canSubscribe: true, reason: "trial_expirado" };
    }
    case "active": {
      const end = t(state.currentPeriodEnd);
      if (n <= end) return { access: "full", commercial: true, canExport: true, canSubscribe: true, reason: state.cancelAtPeriodEnd ? "cancelada_ate_fim_do_periodo" : "ativa", until: iso(end) };
      return afterEnd(end, n);
    }
    case "past_due": {
      const graceEnd = t(state.firstFailedAt) + PAYMENT_GRACE_DAYS * DAY;
      if (n < graceEnd) return { access: "full", commercial: true, canExport: true, canSubscribe: true, reason: "falha_pagamento_tolerancia", until: iso(graceEnd) };
      return { access: "restricted", commercial: false, canExport: true, canSubscribe: true, reason: "falha_pagamento_expirada" };
    }
    case "ended":
      return afterEnd(t(state.endedAt), n);
  }
}

function afterEnd(endMs: number, n: number): V2AccessDecision {
  const exportEnd = endMs + EXPORT_WINDOW_DAYS * DAY;
  if (n < exportEnd) return { access: "export_only", commercial: false, canExport: true, canSubscribe: true, reason: "terminada_exportacao_disponivel", until: iso(exportEnd) };
  return { access: "none", commercial: false, canExport: false, canSubscribe: true, reason: "terminada" };
}

/**
 * Decisão 47: o trial começa na 1.ª ação comercial útil após ativação, nunca
 * no registo, QR ou "Olá". Um trial por conta.
 */
export function shouldStartTrial(input: {
  state: V2BillingState["kind"];
  trialAlreadyUsed: boolean;
  firstUsefulCommercialAction: boolean;
}): boolean {
  return input.state === "activated" && !input.trialAlreadyUsed && input.firstUsefulCommercialAction;
}

/**
 * Decisão 1: quem já pagou mantém o tempo pago. O novo preço só se aplica na
 * renovação seguinte a um aviso com antecedência mínima. A antecedência
 * (`noticeDays`) ainda não foi decidida pelo proprietário — é obrigatória.
 */
export function earliestPriceChangeAt(input: { currentPeriodEnd: string; noticeSentAt: string; noticeDays: number }): string {
  if (!(input.noticeDays > 0)) throw new Error("noticeDays tem de ser decidido (> 0)");
  const minByNotice = t(input.noticeSentAt) + input.noticeDays * DAY;
  let renewal = t(input.currentPeriodEnd);
  // Renovações mensais até a primeira respeitar o aviso.
  while (renewal < minByNotice) {
    const d = new Date(renewal);
    d.setUTCMonth(d.getUTCMonth() + 1);
    renewal = d.getTime();
  }
  return iso(renewal);
}

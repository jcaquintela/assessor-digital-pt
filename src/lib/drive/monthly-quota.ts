// QUOTA MENSAL DE FICHEIROS DO DRIVE INTELIGENTE
//
// Cada ficheiro que entra tem custo real (leitura pelo modelo + espaço). O
// plano Base e o Consultor incluem um número de ficheiros por mês; Pro e Team
// não têm limite. A contagem é por mês de calendário (reset no dia 1) e conta
// pela data de criação — ficheiros arquivados ou já expirados continuam a
// contar para o mês em que foram processados, porque o custo já foi feito.
//
// Módulo puro: recebe números, devolve decisões e textos. Sem BD.

import { normalizeTier, tierLabel, type SubscriptionTier } from "@/lib/subscription/tiers";

/** Ficheiros por mês incluídos em cada plano. `null` = sem limite. */
export const MONTHLY_FILE_QUOTA: Record<SubscriptionTier, number | null> = {
  base: 40,
  consultor: 200,
  pro: null,
  hub: null,
};

/** Plano seguinte, para o convite quando o limite chega ao fim. */
const NEXT_TIER: Partial<Record<SubscriptionTier, SubscriptionTier>> = {
  base: "consultor",
  consultor: "pro",
};

/** A partir de que percentagem avisamos no recibo do upload. */
export const USAGE_HINT_THRESHOLD = 0.8;

export function monthlyFileQuota(tier: string | null | undefined): number | null {
  return MONTHLY_FILE_QUOTA[normalizeTier(tier)];
}

/** Primeiro instante do mês de calendário corrente (para contar na BD). */
export function monthStartISO(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Ainda cabe mais um ficheiro este mês? */
export function withinMonthlyQuota(
  usedThisMonth: number,
  tier: string | null | undefined,
): boolean {
  const limit = monthlyFileQuota(tier);
  if (limit === null) return true;
  return usedThisMonth < limit;
}

/** Aviso ao consultor quando o limite do mês está esgotado. */
export function monthlyQuotaExceededText(
  tier: string | null | undefined,
  usedThisMonth: number,
): string {
  const t = normalizeTier(tier);
  const limit = monthlyFileQuota(t);
  const next = NEXT_TIER[t];
  const upsell = next
    ? `O plano ${tierLabel(next)} inclui ${
        monthlyFileQuota(next) === null ? "ficheiros sem limite" : `${monthlyFileQuota(next)} ficheiros por mês`
      } — diz-me se quiseres saber mais.`
    : "";
  return (
    `Já usaste os ${limit} ficheiros que o plano ${tierLabel(t)} inclui este mês ` +
    `(vais em ${usedThisMonth}). No dia 1 volta a zero. ` +
    "Entretanto continuo a registar tudo o que me disseres por escrito ou por voz. " +
    upsell
  ).trim();
}

/**
 * Linha discreta no recibo do upload, só a partir dos 80%. Planos sem limite
 * nunca vêem contagem nenhuma.
 */
export function usageHintText(
  usedThisMonth: number,
  tier: string | null | undefined,
): string | null {
  const limit = monthlyFileQuota(tier);
  if (limit === null) return null;
  if (usedThisMonth < Math.ceil(limit * USAGE_HINT_THRESHOLD)) return null;
  return `(já usaste ${Math.min(usedThisMonth, limit)} de ${limit} ficheiros este mês)`;
}

/** Junta a linha de utilização a uma resposta já escrita. */
export function withUsageHint(reply: string, hint: string | null): string {
  return hint ? `${reply} ${hint}` : reply;
}

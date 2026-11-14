// Resumo diário agregado das oportunidades detetadas — uma mensagem por dia,
// enviada pelo canal principal através do mecanismo de nudges já existente.

import type { NudgeDraft } from "@/lib/assessor/v3/proactivity.server";
import { sanitizeReply } from "@/lib/assessor/culture/sanitize";
import { composeDigestText } from "./detector";
import { computeOpportunityAlerts } from "./detector.server";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";

export const OPPORTUNITY_DIGEST_PREFIX = "opportunity_digest:";

function lisbonYmdKey(now: Date): string {
  return lisbonYmd(now).replaceAll("-", "");
}

/** Gera (no máximo) um draft de resumo por dia e por consultor. */
export async function generateOpportunityDigestNudges(
  supabase: any,
  userId: string,
  now = new Date(),
): Promise<NudgeDraft[]> {
  const alerts = await computeOpportunityAlerts(supabase, userId, now);
  const texto = composeDigestText(alerts);
  if (!texto) return [];
  return [{
    kind: "consultant_silence" as any,
    subject_type: null,
    subject_id: null,
    reason: "Resumo diário de oportunidades detetadas",
    suggested_reply: sanitizeReply(texto),
    dedupe_key: `${OPPORTUNITY_DIGEST_PREFIX}${lisbonYmdKey(now)}`,
  }];
}

// ---- Fase 1 ACI: oportunidades uma a uma, com evidência e prioridade ----

export const OPPORTUNITY_NUDGES_FLAG = "assessor.opportunity_nudges.v1";

/** Kill switch: flag desligada (ou inexistente) => volta o resumo agregado antigo. */
export async function isOpportunityNudgesEnabled(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", OPPORTUNITY_NUDGES_FLAG)
      .maybeSingle();
    if (flag?.enabled_globally) return true;
    const { data: row } = await supabase
      .from("feature_flag_users")
      .select("user_id")
      .eq("flag_key", OPPORTUNITY_NUDGES_FLAG)
      .eq("user_id", userId)
      .maybeSingle();
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Gera avisos de match comprador↔imóvel e negócio parado para o caminho
 * único `assessor_nudges`. Não repete alertas enviados nos últimos
 * OPPORTUNITY_REPEAT_DAYS dias (por conta, qualquer canal).
 */
export async function generateOpportunityNudges(
  supabase: any,
  userId: string,
  now = new Date(),
): Promise<NudgeDraft[]> {
  const { buildOpportunityNudges, alertKeyFromDedupe, OPPORTUNITY_NUDGE_PREFIX, OPPORTUNITY_REPEAT_DAYS } =
    await import("./opportunity-nudges");
  const alerts = await computeOpportunityAlerts(supabase, userId, now);
  if (!alerts.length) return [];
  const since = new Date(now.getTime() - OPPORTUNITY_REPEAT_DAYS * 864e5).toISOString();
  const { data: recentRows } = await supabase
    .from("assessor_nudges")
    .select("dedupe_key, status, sent_at")
    .eq("user_id", userId)
    .eq("status", "sent")
    .like("dedupe_key", `${OPPORTUNITY_NUDGE_PREFIX}%`)
    .gte("sent_at", since);
  const recent = ((recentRows as any[]) ?? [])
    .map((r) => alertKeyFromDedupe(r.dedupe_key))
    .filter((k): k is string => !!k);
  return buildOpportunityNudges(alerts, {
    ymdCompact: lisbonYmdKey(now),
    recentlySentAlertKeys: recent,
  }).map((d) => ({ ...d, suggested_reply: sanitizeReply(d.suggested_reply) }));
}

/** Escolhe o gerador conforme o kill switch. */
export async function generateOpportunityDrafts(
  supabase: any,
  userId: string,
  now = new Date(),
): Promise<NudgeDraft[]> {
  return (await isOpportunityNudgesEnabled(supabase, userId))
    ? generateOpportunityNudges(supabase, userId, now)
    : generateOpportunityDigestNudges(supabase, userId, now);
}

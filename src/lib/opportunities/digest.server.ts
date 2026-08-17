// Resumo diário agregado das oportunidades detetadas — uma mensagem por dia,
// enviada pelo canal principal através do mecanismo de nudges já existente.

import type { NudgeDraft } from "@/lib/assessor/v3/proactivity.server";
import { sanitizeReply } from "@/lib/assessor/culture/sanitize";
import { composeDigestText } from "./detector";
import { computeOpportunityAlerts } from "./detector.server";

export const OPPORTUNITY_DIGEST_PREFIX = "opportunity_digest:";

function lisbonYmdKey(now: Date): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return `${m.year}${m.month}${m.day}`;
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
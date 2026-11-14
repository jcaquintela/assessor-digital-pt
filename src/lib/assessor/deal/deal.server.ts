// Negócio em risco, action-first (mesmo interruptor por conta:
// `assessor.action_first_qualification.v1`, desligado). Só contas e texto:
// não lê nem escreve no domínio, não contacta ninguém.

import { isAccountFlagEnabled } from "@/lib/flags/account-flag.server";
import { ACTION_FIRST_FLAG, CONTINUATION_WINDOW_MS } from "../qualification/qualification.server";
import { composeDealReply, isDealReply } from "./compose";
import { extractDealBrief, isDealRisk, mergeDealBriefs, type DealBrief } from "./deal-brief";
import { dealPlan, type DealPlan } from "./deal-plan";

export interface DealDeps {
  loadRecent(): Promise<Array<{ role: string; content: string; created_at: string }>>;
}

export function defaultDealDeps(supabase: any, userId: string, channel: string): DealDeps {
  return {
    async loadRecent() {
      const since = new Date(Date.now() - CONTINUATION_WINDOW_MS).toISOString();
      const { data } = await supabase.from("assessor_messages").select("role, content, created_at")
        .eq("user_id", userId).eq("channel", channel).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(20);
      return ((data ?? []) as any[]).reverse();
    },
  };
}

const ADDS_RE = /\b(\d{2}\s+anos|cpcv|condicao|clausula|sinal|capitais|avaliac|proposta|vendedor|aceit|recus|\d+\s*(?:k|mil)\b|€)/;

/** Brief do negócio a partir das mensagens do consultor (desde a que o abriu). */
export function dealBriefFromMessages(users: string[], now: Date): DealBrief {
  const first = Math.max(0, users.findIndex((u) => isDealRisk(u)));
  return mergeDealBriefs(users.slice(first).map((u) => extractDealBrief(u, now)));
}

export interface DealTurn { reply: string; acted: boolean; brief: DealBrief; plan: DealPlan }

export async function runDealRisk(params: {
  supabase: any; userId: string; channel: string; trimmed: string; now?: Date; deps?: DealDeps; skipFlagCheck?: boolean;
}): Promise<DealTurn | null> {
  const { supabase, userId, channel, trimmed } = params;
  if (!params.skipFlagCheck && !(await isAccountFlagEnabled(supabase, ACTION_FIRST_FLAG, userId))) return null;
  const now = params.now ?? new Date();
  const deps = params.deps ?? defaultDealDeps(supabase, userId, channel);
  const startsNow = isDealRisk(trimmed);
  const recent = startsNow ? [] : await deps.loadRecent();
  const lastAssistant = [...recent].reverse().find((r) => r.role === "assistant") ?? null;
  const continuing = !startsNow && !!lastAssistant && isDealReply(lastAssistant.content) &&
    now.getTime() - new Date(lastAssistant.created_at).getTime() < CONTINUATION_WINDOW_MS;
  if (!startsNow && !continuing) return null;
  if (!startsNow && !ADDS_RE.test(trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) return null;

  let brief: DealBrief;
  if (startsNow) brief = extractDealBrief(trimmed, now);
  else {
    const users = recent.filter((r) => r.role === "user").map((r) => String(r.content ?? ""));
    if (users[users.length - 1]?.trim() !== trimmed) users.push(trimmed);
    brief = dealBriefFromMessages(users, now);
  }
  const plan = dealPlan(brief, now);
  return { reply: composeDealReply(brief, plan, { update: !startsNow }), acted: plan.canSimulate, brief, plan };
}

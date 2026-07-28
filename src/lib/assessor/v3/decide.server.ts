// Reasoning Engine — Fase 4: DECIDE.

import { callGateway, V2_MODEL_DEFAULT, type GatewayUsage } from "../v2/gateway.server";
import { DECIDE_SYSTEM_PROMPT } from "./prompts";
import type { Decision, DecisionToolCall, MemoryWrite, Observation, Hypothesis, SearchResults } from "./types";

export interface DecideResult {
  ok: boolean;
  decision: Decision;
  usage: GatewayUsage;
  latencyMs: number;
  error?: string;
}

function parseJsonLoose(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* noop */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function coerceToolCalls(v: unknown): DecisionToolCall[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 6).map((c: any) => ({
    name: String(c?.name ?? "").slice(0, 40),
    arguments: (c?.arguments && typeof c.arguments === "object") ? c.arguments : {},
  })).filter((c) => c.name);
}

function coerceMemoryWrites(v: unknown): MemoryWrite[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 8).map((m: any) => ({
    scope: (["immediate", "operational", "strategic", "permanent"].includes(m?.scope) ? m.scope : "operational") as MemoryWrite["scope"],
    key: String(m?.key ?? "").slice(0, 60),
    value: m?.value,
    target_person_id: m?.target_person_id ?? null,
    target_property_id: m?.target_property_id ?? null,
  })).filter((m) => m.key);
}

function coerceAction(v: unknown): Decision["action"] {
  const s = String(v ?? "").toLowerCase();
  if (s === "act" || s === "ask" || s === "acknowledge" || s === "do_nothing" || s === "search_more") return s;
  return "acknowledge";
}

export async function decide(input: {
  content: string;
  observations: Observation[];
  hypotheses: Hypothesis[];
  searches: SearchResults;
  historyPreview?: string;
  assessorName: string;
  userFirstName: string;
  nowLisbonYmd: string;
  nowLisbonHuman: string;
}): Promise<DecideResult> {
  const started = Date.now();
  const userPayload = {
    now_lisbon_ymd: input.nowLisbonYmd,
    now_lisbon_human: input.nowLisbonHuman,
    assessor_name: input.assessorName,
    consultant_first_name: input.userFirstName,
    message: input.content,
    observations: input.observations,
    hypotheses: input.hypotheses,
    searches: input.searches,
    recent_context: input.historyPreview ?? null,
  };

  const call = await callGateway({
    model: V2_MODEL_DEFAULT,
    messages: [
      { role: "system", content: DECIDE_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    temperature: 0.25,
    maxTokens: 700,
    responseFormat: { type: "json_object" },
  });

  const fallback: Decision = {
    confidence: 0,
    action: "acknowledge",
    tool_calls: [],
    memory_writes: [],
    natural_reply: "",
  };

  if (!call.ok || !call.message?.content) {
    return { ok: false, decision: fallback, usage: call.usage, latencyMs: Date.now() - started, error: call.error ?? "decide_gateway_failed" };
  }

  const parsed = parseJsonLoose(call.message.content) ?? {};
  const decision: Decision = {
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    action: coerceAction(parsed.action),
    tool_calls: coerceToolCalls(parsed.tool_calls),
    memory_writes: coerceMemoryWrites(parsed.memory_writes),
    natural_reply: String(parsed.natural_reply ?? "").trim(),
    needs_confirmation: Boolean(parsed.needs_confirmation),
  };
  return { ok: true, decision, usage: call.usage, latencyMs: Date.now() - started };
}
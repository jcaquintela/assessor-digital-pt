// Reasoning Engine — Fase 2: THINK.

import { callGateway, V2_MODEL_DEFAULT, type GatewayUsage } from "../v2/gateway.server";
import { THINK_SYSTEM_PROMPT } from "./prompts";
import { budgetHistoryPreview } from "./context-budget";
import type { Hypothesis, MemoryValue, Observation, SearchName, ThinkOutput } from "./types";

export interface ThinkResult {
  ok: boolean;
  output: ThinkOutput;
  usage: GatewayUsage;
  latencyMs: number;
  error?: string;
  unavailable?: boolean;
}

const VALID_SEARCHES: readonly SearchName[] = [
  "people_by_phone", "people_by_name",
  "properties_by_location", "properties_by_title",
  "agenda_today", "agenda_tomorrow", "agenda_week",
  "conversation_state", "pending_action",
  "prospecting_by_phone", "prospecting_by_location",
];

function coerceMemoryValue(v: unknown): MemoryValue {
  const s = String(v ?? "").toLowerCase();
  if (s === "temporary" || s === "permanent" || s === "strategic" || s === "emotional") return s;
  return "none";
}

function coerceHypotheses(v: unknown): Hypothesis[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 6).map((h: any) => ({
    label: String(h?.label ?? "").slice(0, 80) || "unknown",
    confidence: Math.max(0, Math.min(1, Number(h?.confidence ?? 0))),
    reasoning: h?.reasoning ? String(h.reasoning).slice(0, 200) : undefined,
  }));
}

function coerceSearches(v: unknown): SearchName[] {
  if (!Array.isArray(v)) return [];
  const out: SearchName[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const s = String(raw) as SearchName;
    if (VALID_SEARCHES.includes(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function parseJsonLoose(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* noop */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function think(input: {
  content: string;
  observations: Observation[];
  historyPreview?: string;
}): Promise<ThinkResult> {
  const started = Date.now();
  const userPayload = {
    message: input.content,
    observations: input.observations,
    recent_context: budgetHistoryPreview(input.historyPreview) || null,
  };

  const call = await callGateway({
    model: V2_MODEL_DEFAULT,
    messages: [
      { role: "system", content: THINK_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    temperature: 0.15,
    maxTokens: 2000,
    responseFormat: { type: "json_object" },
  });

  const empty: ThinkOutput = {
    observations: input.observations,
    hypotheses: [],
    memory_value: "none",
    recommended_searches: [],
  };

  if (!call.ok || !call.message?.content) {
    return {
      ok: false, output: empty, usage: call.usage, latencyMs: Date.now() - started,
      error: call.error ?? "think_gateway_failed",
      unavailable: call.unavailable === true,
    };
  }

  const parsed = parseJsonLoose(call.message.content) ?? {};
  const output: ThinkOutput = {
    observations: input.observations,
    hypotheses: coerceHypotheses(parsed.hypotheses),
    memory_value: coerceMemoryValue(parsed.memory_value),
    recommended_searches: coerceSearches(parsed.recommended_searches),
  };
  return { ok: true, output, usage: call.usage, latencyMs: Date.now() - started };
}
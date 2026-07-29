// Reasoning Engine — Fase 5: ACT.

import { TOOL_REGISTRY, type DomainContext, type DomainResult } from "../v2/domain.server";
import { ZOD_BY_TOOL, CreateProspectingLeadArgs } from "../v2/tools";
import { createPendingAction, markPendingActionStatus } from "../memory.server";
import type { DecisionToolCall, MemoryWrite } from "./types";

export interface ToolExecResult {
  name: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
}

export async function executeToolCalls(
  ctx: DomainContext,
  toolCalls: DecisionToolCall[],
): Promise<ToolExecResult[]> {
  const out: ToolExecResult[] = [];
  for (const tc of toolCalls) {
    const t0 = Date.now();
    const exec = TOOL_REGISTRY[tc.name];
    if (!exec) {
      out.push({ name: tc.name, ok: false, error: "unknown_tool", latencyMs: Date.now() - t0 });
      continue;
    }
    const schema = ZOD_BY_TOOL[tc.name];
    const parsed = schema?.safeParse(tc.arguments);
    if (schema && parsed && !parsed.success) {
      out.push({
        name: tc.name, ok: false,
        error: `invalid_args:${parsed.error.issues[0]?.message ?? "unknown"}`,
        latencyMs: Date.now() - t0,
      });
      continue;
    }
    let result: DomainResult;
    try { result = await exec(ctx, tc.arguments); }
    catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    out.push({
      name: tc.name,
      ok: !!result.ok,
      data: result.data,
      error: result.ok ? undefined : (result.error ?? "unknown"),
      latencyMs: Date.now() - t0,
    });
  }
  return out;
}

export async function applyMemoryWrites(
  ctx: DomainContext,
  writes: MemoryWrite[],
): Promise<void> {
  if (!writes.length) return;

  const stateUpdate: Record<string, unknown> = {};
  for (const w of writes) {
    if (w.scope === "immediate" || w.scope === "operational") {
      if ([
        "last_property_id", "active_person_id", "goal", "factual_summary",
        "state_summary", "last_intent",
        "last_entity_type", "last_entity_id",
      ].includes(w.key)) {
        stateUpdate[w.key] = w.value ?? null;
      }
      // Proposta de prospeção — cria um pending_action que a próxima
      // confirmação do consultor irá executar.
      if (w.key === "propose_prospecting_lead" && w.value && typeof w.value === "object") {
        const parsed = CreateProspectingLeadArgs.safeParse(w.value);
        if (parsed.success) {
          try {
            await createPendingAction(ctx.supabase, {
              userId: ctx.userId,
              channel: ctx.channel,
              intent: "create_prospecting_lead",
              originalContent: "",
              payload: parsed.data as Record<string, unknown>,
              sourceMessageId: ctx.sourceMessageId ?? null,
            });
          } catch { /* noop */ }
        }
      }
      // Cancelamento explícito da proposta pendente.
      if (w.key === "cancel_pending_prospecting_lead" && w.value) {
        try {
          const { data: pend } = await ctx.supabase
            .from("pending_actions")
            .select("id")
            .eq("user_id", ctx.userId)
            .eq("channel", ctx.channel)
            .eq("intent", "create_prospecting_lead")
            .in("status", ["pending_confirmation", "collecting_information"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (pend?.id) await markPendingActionStatus(ctx.supabase, pend.id, "cancelled");
        } catch { /* noop */ }
      }
    }
    if ((w.scope === "strategic" || w.scope === "permanent") && w.target_person_id && typeof w.value === "string") {
      try {
        await ctx.supabase.from("people").update({ summary: w.value }).eq("id", w.target_person_id).eq("user_id", ctx.userId);
      } catch { /* noop */ }
    }
    if ((w.scope === "strategic" || w.scope === "permanent") && w.target_property_id && typeof w.value === "string") {
      try {
        await ctx.supabase.from("properties").update({ notes: w.value }).eq("id", w.target_property_id).eq("user_id", ctx.userId);
      } catch { /* noop */ }
    }
  }

  if (Object.keys(stateUpdate).length) {
    try {
      await ctx.supabase.from("conversation_states").upsert({
        user_id: ctx.userId,
        channel: ctx.channel,
        external_conversation_id: ctx.channel,
        ...stateUpdate,
      } as never, { onConflict: "user_id,channel,external_conversation_id" });
    } catch { /* noop */ }
  }
}
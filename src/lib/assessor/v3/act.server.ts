// Reasoning Engine — Fase 5: ACT.

import { TOOL_REGISTRY, type DomainContext, type DomainResult } from "../v2/domain.server";
import { ZOD_BY_TOOL, CreateProspectingLeadArgs } from "../v2/tools";
import { createPendingAction, findActivePendingAction, markPendingActionStatus } from "../memory.server";
import type { DecisionToolCall, MemoryWrite } from "./types";

// O modelo escreve por vezes o estado em português ("por contactar") onde o
// domínio espera o valor canónico. Sem isto, uma leitura perfeitamente
// válida rebentava na validação e o consultor via "não consegui guardar".
const LEAD_STATUS_ALIASES: Record<string, string> = {
  "por contactar": "to_contact", "para contactar": "to_contact", "a contactar": "to_contact",
  "por ligar": "to_contact", "nova": "to_contact", "novas": "to_contact",
  "tentativa de contacto": "contact_attempted", "tentado": "contact_attempted",
  "contactada": "contacted", "contactado": "contacted", "contactadas": "contacted",
  "sem interesse": "no_interest", "recusou": "no_interest",
  "oportunidade": "opportunity", "convertida": "converted", "convertido": "converted",
  "arquivada": "archived", "arquivado": "archived",
};

function normalizeToolArgs(name: string, args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  if (name !== "search_prospecting_leads" && name !== "update_prospecting_lead") return args;
  const a = { ...(args as Record<string, unknown>) };
  const raw = typeof a.status === "string" ? a.status.trim().toLowerCase() : null;
  if (raw && LEAD_STATUS_ALIASES[raw]) a.status = LEAD_STATUS_ALIASES[raw];
  return a;
}

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
  // Se estamos a criar seguimentos/eventos e ainda não temos pendingActionId
  // no contexto, procuramos a pending activa desta conversa. Sem isto, dois
  // "sim" seguidos gerariam dois registos (perde-se a idempotência dura).
  let effectiveCtx: DomainContext = ctx;
  const needsPending = !ctx.pendingActionId && toolCalls.some(
    (t) => t.name === "create_follow_up" || t.name === "create_event",
  );
  if (needsPending) {
    try {
      const pending = await findActivePendingAction(ctx.supabase, ctx.userId, ctx.channel);
      if (pending?.id) effectiveCtx = { ...ctx, pendingActionId: pending.id };
    } catch { /* noop */ }
  }
  for (const tc of toolCalls) {
    const t0 = Date.now();
    const exec = TOOL_REGISTRY[tc.name];
    if (!exec) {
      out.push({ name: tc.name, ok: false, error: "unknown_tool", latencyMs: Date.now() - t0 });
      continue;
    }
    const schema = ZOD_BY_TOOL[tc.name];
    const args = normalizeToolArgs(tc.name, tc.arguments);
    const parsed = schema?.safeParse(args);
    if (schema && parsed && !parsed.success) {
      out.push({
        name: tc.name, ok: false,
        error: `invalid_args:${parsed.error.issues[0]?.message ?? "unknown"}`,
        latencyMs: Date.now() - t0,
      });
      continue;
    }
    let result: DomainResult;
    try { result = await exec(effectiveCtx, args); }
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
// Reasoning Engine — Fase 5: ACT.

import { TOOL_REGISTRY, type DomainContext, type DomainResult } from "../v2/domain.server";
import { ZOD_BY_TOOL, CreateProspectingLeadArgs } from "../v2/tools";
import { createPendingAction, findActivePendingAction, markPendingActionStatus } from "../memory.server";
import { cleanTitle } from "../titles";
import type { DecisionToolCall, MemoryWrite } from "./types";

// O modelo escreve por vezes o estado em português ("por contactar") onde o
// domínio espera o valor canónico. Sem isto, uma leitura perfeitamente
// válida rebentava na validação e o consultor via "não consegui guardar".
const LEAD_STATUS_ALIASES: Record<string, string> = {
  "por contactar": "to_contact", "para contactar": "to_contact", "a contactar": "to_contact",
  "por ligar": "to_contact", "nova": "to_contact", "novas": "to_contact",
  "new": "to_contact", "pending": "to_contact", "por_contactar": "to_contact", "to contact": "to_contact",
  "tentativa de contacto": "contact_attempted", "tentado": "contact_attempted",
  "attempted": "contact_attempted", "contact attempted": "contact_attempted",
  "contactada": "contacted", "contactado": "contacted", "contactadas": "contacted",
  "sem interesse": "no_interest", "recusou": "no_interest", "no interest": "no_interest",
  "oportunidade": "opportunity", "convertida": "converted", "convertido": "converted",
  "arquivada": "archived", "arquivado": "archived",
};

const LEAD_STATUS_VALUES = new Set([
  "to_contact", "contact_attempted", "contacted", "no_interest", "opportunity", "converted", "archived",
]);

// O mesmo problema acontece com o tipo de relação de um contacto: o modelo
// escreve "lead", "cliente" ou "vendedor" onde o domínio só aceita seis
// valores. Sem esta tradução, "Adicionar o João Paulo aos contactos"
// falhava na validação e o consultor via "não consegui guardar".
const RELATIONSHIP_VALUES = new Set([
  "proprietario", "comprador", "potencial_cliente", "parceiro", "referencia", "outro",
]);

const RELATIONSHIP_ALIASES: Record<string, string> = {
  lead: "potencial_cliente", leads: "potencial_cliente",
  "potencial cliente": "potencial_cliente", potencial: "potencial_cliente",
  "potencial comprador": "comprador", "possivel cliente": "potencial_cliente",
  cliente: "potencial_cliente", contacto: "outro", contact: "outro",
  prospect: "potencial_cliente", prospeccao: "potencial_cliente",
  buyer: "comprador", compradora: "comprador", "comprador potencial": "comprador",
  owner: "proprietario", proprietaria: "proprietario", "proprietário": "proprietario",
  vendedor: "proprietario", vendedora: "proprietario", seller: "proprietario",
  partner: "parceiro", parceira: "parceiro", colega: "parceiro", fornecedor: "parceiro",
  referral: "referencia", "referência": "referencia", recomendacao: "referencia",
  amigo: "outro", familiar: "outro", other: "outro", unknown: "outro", desconhecido: "outro",
};

function normalizeRelationshipType(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "outro";
  if (RELATIONSHIP_VALUES.has(raw)) return raw;
  const noAccents = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (RELATIONSHIP_VALUES.has(noAccents)) return noAccents;
  return RELATIONSHIP_ALIASES[raw] ?? RELATIONSHIP_ALIASES[noAccents] ?? "outro";
}

function normalizeToolArgs(name: string, args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  // O modelo escreve por vezes a string "null" (ou "sem título") no campo
  // título. Isso passava o `min(1)` do Zod e chegava à BD como texto.
  if (name === "create_follow_up" || name === "create_event" || name === "create_reminder") {
    const a = { ...(args as Record<string, unknown>) };
    const fallback = name === "create_event" ? "Compromisso" : "Lembrete";
    a.title = cleanTitle(a.title) ?? fallback;
    return a;
  }
  if (name === "create_person") {
    const a = { ...(args as Record<string, unknown>) };
    a.relationship_type = normalizeRelationshipType(a.relationship_type);
    // Email inválido não pode deitar abaixo a criação do contacto.
    if (typeof a.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) a.email = null;
    return a;
  }
  if (name !== "search_prospecting_leads" && name !== "update_prospecting_lead") return args;
  const a = { ...(args as Record<string, unknown>) };
  const raw = typeof a.status === "string" ? a.status.trim().toLowerCase() : null;
  if (raw) {
    if (LEAD_STATUS_VALUES.has(raw)) a.status = raw;
    else if (LEAD_STATUS_ALIASES[raw]) a.status = LEAD_STATUS_ALIASES[raw];
    // Estado desconhecido numa LEITURA: melhor devolver tudo do que falhar.
    else if (name === "search_prospecting_leads") a.status = null;
  }
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
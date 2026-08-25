// Persistência da memória de escrita e da auditoria de ferramentas (v3).
//
// Duas lacunas do motor v3 desde 28/07 (data em que substituiu o v2, que era
// quem fazia estas duas escritas):
//   1. conversation_states nunca guardava o recurso acabado de criar;
//   2. assessor_tool_calls deixou de receber qualquer linha (cegueira de
//      auditoria — o painel de erros de escrita ficou vazio).

import type { CreatedResourceType } from "./created-memory";

export async function recordCreatedResource(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    type: CreatedResourceType;
    id: string;
  },
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      user_id: args.userId,
      channel: args.channel,
      external_conversation_id: args.channel,
      last_created_resource_type: args.type,
      last_created_resource_id: args.id,
      last_entity_type: args.type,
      last_entity_id: args.id,
    };
    if (args.type === "property") row.last_property_id = args.id;
    if (args.type === "person") row.active_person_id = args.id;
    await supabase
      .from("conversation_states")
      .upsert(row as never, { onConflict: "user_id,channel,external_conversation_id" });
  } catch {
    /* memória de conversa nunca bloqueia a resposta */
  }
}

/** Lê o último recurso criado nesta conversa (memória de escrita). */
export async function readCreatedResource(
  supabase: any,
  args: { userId: string; channel: string },
): Promise<{ type: string; id: string } | null> {
  try {
    const { data } = await supabase
      .from("conversation_states")
      .select("last_created_resource_type, last_created_resource_id")
      .eq("user_id", args.userId)
      .eq("channel", args.channel)
      .maybeSingle();
    if (!data?.last_created_resource_id) return null;
    return {
      type: String(data.last_created_resource_type ?? ""),
      id: String(data.last_created_resource_id),
    };
  } catch {
    return null;
  }
}

function trim(value: unknown, max = 4000): unknown {
  try {
    const json = JSON.stringify(value ?? null);
    if (json && json.length > max) return { truncated: true, preview: json.slice(0, max) };
    return value ?? null;
  } catch {
    return null;
  }
}

/** Auditoria: uma linha por ferramenta executada, boa ou má. */
export async function logToolCall(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    tool: string;
    arguments?: unknown;
    result?: unknown;
    success: boolean;
    error?: string | null;
    latencyMs?: number | null;
  },
): Promise<void> {
  try {
    await supabase.from("assessor_tool_calls").insert({
      user_id: args.userId,
      channel: args.channel,
      tool_name: args.tool,
      arguments: trim(args.arguments) ?? {},
      result: trim(args.result),
      success: args.success,
      error: args.error ? String(args.error).slice(0, 500) : null,
      latency_ms: args.latencyMs ?? null,
    } as never);
  } catch {
    /* auditoria nunca bloqueia a resposta */
  }
}

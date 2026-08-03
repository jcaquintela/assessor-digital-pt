// Classificação honesta de "ação autónoma".
//
// Regra de ouro: uma escrita que falhou NÃO aconteceu — nunca pode ser
// contada como ação mantida. E uma pesquisa não é uma ação: é leitura.

export type ToolKind = "read" | "write";

/** Tabela onde a escrita aterra, para depois verificar se ainda existe. */
export const WRITE_TOOL_TABLE: Record<string, string> = {
  create_person: "people",
  create_contact_from_card: "people",
  create_property: "properties",
  update_property: "properties",
  create_follow_up: "follow_ups",
  create_routine: "routines",
  create_event: "follow_ups",
  create_reminder: "reminders",
  save_interaction: "interactions",
  save_miscellaneous: "miscellaneous_items",
  create_financial_movement: "financial_movements",
  create_financial_movement_fast_path: "financial_movements",
  create_prospecting_lead: "prospecting_leads",
  update_prospecting_lead: "prospecting_leads",
  cancel_pending_prospecting_lead: "prospecting_leads",
};

export function toolKind(name: string): ToolKind {
  if (WRITE_TOOL_TABLE[name]) return "write";
  if (/^(search|list|get|find|read|propose)_/.test(name)) return "read";
  // Desconhecida: tratamos como leitura para não inflacionar ações autónomas.
  return "read";
}

/** Extrai o id da entidade criada/alterada do payload devolvido pela tool. */
export function extractEntityId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;
  if (typeof d.id === "string") return d.id;
  for (const v of Object.values(d)) {
    if (v && typeof v === "object" && typeof (v as any).id === "string") return (v as any).id;
  }
  return null;
}

export type ActionOutcome =
  | "sucesso"
  | "falhou"
  | "corrigida"
  | "revertida"
  | "duplicada";

export type ClassifiedTool = {
  name: string;
  kind: ToolKind;
  ok: boolean;
  error: string | null;
  entityId: string | null;
  table: string | null;
};

export function classifyTools(toolCalls: unknown): ClassifiedTool[] {
  const list = Array.isArray(toolCalls) ? (toolCalls as any[]) : [];
  return list.map((c) => {
    const name = String(c?.name ?? "—");
    const kind = toolKind(name);
    return {
      name,
      kind,
      ok: c?.ok !== false,
      error: c?.error ?? null,
      entityId: kind === "write" && c?.ok !== false ? extractEntityId(c?.data) : null,
      table: WRITE_TOOL_TABLE[name] ?? null,
    };
  });
}

/**
 * Resultado de um turno, já sabendo se houve correção do consultor e se a
 * entidade criada ainda existe. A ordem é deliberada: falha vence tudo.
 */
export function resolveOutcome(input: {
  tools: ClassifiedTool[];
  traceError?: string | null;
  hasCorrection: boolean;
  deleted: boolean;
  duplicate: boolean;
}): ActionOutcome {
  const writes = input.tools.filter((t) => t.kind === "write");
  if (writes.some((w) => !w.ok) || input.traceError) return "falhou";
  if (input.deleted) return "revertida";
  if (input.hasCorrection) return "corrigida";
  if (input.duplicate) return "duplicada";
  return "sucesso";
}

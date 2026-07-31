// Sugestão automática de ligações extra.
// O Afonso nunca liga sozinho o que não tem a certeza: quando um ficheiro já
// está ligado a um registo e o texto aponta claramente para outro, propõe a
// ligação e espera confirmação (Sim/Não, com botões quando o canal permite).
import { matchEntities, type LinkCandidate, type LinkTarget, type LinkableType, LINKABLE_LABEL } from "./link-match";

export const SUGGEST_LINK_INTENT = "suggest_file_link";

async function loadTargets(supabase: any, userId: string): Promise<LinkTarget[]> {
  const [people, props, deals] = await Promise.all([
    supabase.from("people").select("id, name").eq("user_id", userId).limit(400),
    supabase.from("properties").select("id, title, address, location").eq("user_id", userId).limit(400),
    supabase.from("opportunities").select("id, title, deal_kind, type, stage").eq("user_id", userId).is("archived_at", null).limit(400),
  ]);
  const out: LinkTarget[] = [];
  for (const r of ((people.data ?? []) as any[])) {
    if (r.name) out.push({ entityType: "person", entityId: r.id, label: r.name });
  }
  for (const r of ((props.data ?? []) as any[])) {
    const label = r.title || r.address || r.location;
    if (label) out.push({ entityType: "property", entityId: r.id, label });
  }
  for (const r of ((deals.data ?? []) as any[])) {
    if (r.title) out.push({ entityType: "opportunity", entityId: r.id, label: r.title });
  }
  return out;
}

export function fileSearchText(file: any): string {
  return [
    file?.original_file_name,
    file?.user_description,
    file?.ai_summary,
    file?.extracted_text,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 20000);
}

/** Candidatos mencionados no ficheiro que ainda não estão ligados. */
export async function findLinkCandidates(
  supabase: any,
  userId: string,
  fileId: string,
  extraText?: string | null,
): Promise<LinkCandidate[]> {
  const [{ data: file }, { data: links }] = await Promise.all([
    supabase
      .from("uploaded_files")
      .select("id, original_file_name, user_description, ai_summary, extracted_text")
      .eq("id", fileId).eq("user_id", userId).maybeSingle(),
    supabase.from("file_links").select("entity_type, entity_id").eq("user_id", userId).eq("file_id", fileId),
  ]);
  if (!file) return [];

  const already = new Set(((links ?? []) as any[]).map((l) => `${l.entity_type}:${l.entity_id}`));
  const text = [fileSearchText(file), extraText ?? ""].join("\n");
  const targets = await loadTargets(supabase, userId);
  return matchEntities(text, targets).filter(
    (c) => !already.has(`${c.entityType}:${c.entityId}`),
  );
}

/** Adiciona uma ligação sem tocar nas existentes (idempotente). */
export async function addFileLink(
  supabase: any,
  userId: string,
  fileId: string,
  entityType: LinkableType,
  entityId: string,
  source: "user" | "ai" = "user",
): Promise<void> {
  await supabase.from("file_links").upsert(
    {
      user_id: userId,
      file_id: fileId,
      entity_type: entityType,
      entity_id: entityId,
      relation_type: "related_to",
      source,
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,file_id,entity_type,entity_id,relation_type" },
  );
}

export interface AutoLinkResult {
  linked: LinkCandidate | null;
  suggested: LinkCandidate | null;
  reply: string | null;
}

/**
 * Liga automaticamente o registo mais óbvio e propõe o seguinte.
 * Devolve reply=null quando não há nada claro (o fluxo normal segue).
 */
export async function autoLinkAndSuggest(args: {
  supabase: any;
  userId: string;
  channel: string;
  fileId: string;
  fileLabel: string;
  extraText?: string | null;
  sourceMessageId?: string | null;
}): Promise<AutoLinkResult> {
  const { supabase, userId, channel, fileId, fileLabel } = args;
  const candidates = await findLinkCandidates(supabase, userId, fileId, args.extraText ?? null);
  const strong = candidates.filter((c) => c.score >= 0.8);
  if (strong.length === 0) return { linked: null, suggested: null, reply: null };

  const linked = strong[0];
  await addFileLink(supabase, userId, fileId, linked.entityType, linked.entityId, "ai");
  await supabase
    .from("uploaded_files")
    .update({ related_resource_type: linked.entityType, related_resource_id: linked.entityId })
    .eq("id", fileId)
    .eq("user_id", userId);

  const suggested = strong.find(
    (c) => c.entityType !== linked.entityType || c.entityId !== linked.entityId,
  ) ?? null;

  const base = `Guardei ${fileLabel} e liguei a ${linked.label} (${LINKABLE_LABEL[linked.entityType].toLowerCase()}).`;
  if (!suggested) return { linked, suggested: null, reply: base };

  const reply = `${base} Também parece relacionado com ${suggested.label} (${LINKABLE_LABEL[suggested.entityType].toLowerCase()}). Queres que ligue também?`;

  const { findActivePendingAction, markPendingActionStatus, createPendingAction } =
    await import("@/lib/assessor/memory.server");
  const prev = await findActivePendingAction(supabase, userId, channel);
  if (prev) await markPendingActionStatus(supabase, prev.id, "cancelled");
  await createPendingAction(supabase, {
    userId,
    channel,
    intent: SUGGEST_LINK_INTENT,
    originalContent: `Sugestão de ligação para ${fileLabel}`,
    payload: {
      file_id: fileId,
      entity_type: suggested.entityType,
      entity_id: suggested.entityId,
      entity_label: suggested.label,
      reason: suggested.reason,
    },
    pendingQuestion: reply,
    currentQuestion: "confirm_extra_link",
    sourceMessageId: args.sourceMessageId ?? null,
  });
  return { linked, suggested, reply };
}

/** Aplica (ou descarta) uma sugestão pendente. Nunca remove ligações. */
export async function applyLinkSuggestion(
  supabase: any,
  userId: string,
  payload: Record<string, any>,
): Promise<string> {
  const fileId = String(payload?.file_id ?? "");
  const entityType = String(payload?.entity_type ?? "") as LinkableType;
  const entityId = String(payload?.entity_id ?? "");
  const label = String(payload?.entity_label ?? "o registo");
  if (!fileId || !entityId) return "Já não encontro esse documento. Podes indicar outra vez?";
  await addFileLink(supabase, userId, fileId, entityType, entityId, "user");
  return `Feito. O documento fica ligado também a ${label}.`;
}
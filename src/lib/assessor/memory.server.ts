// Memory layer for the Assessor.
//
// Persists per-user, per-channel conversation state and pending actions in the
// database (pending_actions, conversation_states). All access is scoped to
// user_id and enforced by RLS. Callers pass the admin client because it is
// invoked from webhook contexts without a bearer token; RLS still applies to
// the authenticated path.

export type PendingActionStatus =
  | "collecting_information"
  | "pending_confirmation"
  | "executing"
  | "executed"
  | "correction_pending"
  | "corrected"
  | "cancelled"
  | "failed"
  | "expired";

export interface PendingActionRow {
  id: string;
  user_id: string;
  channel: string;
  intent: string;
  original_content: string;
  structured_payload: Record<string, any>;
  missing_fields: string[];
  status: PendingActionStatus;
  confidence: number | null;
  pending_question: string | null;
  current_question: string | null;
  created_resource_type: string | null;
  created_resource_id: string | null;
  error_message: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function isoFuture(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

// Locate the most recent pending action that still needs the user's answer.
// Automatically marks stale rows as expired so the caller can react.
export async function findActivePendingAction(
  supabase: any,
  userId: string,
  channel: string,
): Promise<PendingActionRow | null> {
  const { data } = await supabase
    .from("pending_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .in("status", ["pending_confirmation", "collecting_information", "correction_pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data as PendingActionRow | null) ?? null;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    await supabase
      .from("pending_actions")
      .update({ status: "expired" } as never)
      .eq("id", row.id);
    return null;
  }
  return row;
}

export async function findLastExecutedAction(
  supabase: any,
  userId: string,
  channel: string,
  intents?: string[],
): Promise<PendingActionRow | null> {
  let q = supabase
    .from("pending_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("status", "executed")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (intents && intents.length) q = q.in("intent", intents);
  const { data } = await q.maybeSingle();
  return (data as PendingActionRow | null) ?? null;
}

export async function createPendingAction(
  supabase: any,
  input: {
    userId: string;
    channel: string;
    intent: string;
    originalContent: string;
    payload: Record<string, any>;
    missingFields?: string[];
    confidence?: number | null;
    pendingQuestion?: string | null;
    currentQuestion?: string | null;
    sourceMessageId?: string | null;
  },
): Promise<PendingActionRow | null> {
  const { data, error } = await supabase
    .from("pending_actions")
    .insert({
      user_id: input.userId,
      channel: input.channel,
      intent: input.intent,
      original_content: input.originalContent,
      structured_payload: input.payload as never,
      missing_fields: input.missingFields ?? [],
      status: (input.missingFields?.length ? "collecting_information" : "pending_confirmation") as PendingActionStatus,
      confidence: input.confidence ?? null,
      pending_question: input.pendingQuestion ?? null,
      current_question: input.currentQuestion ?? null,
      source_message_id: input.sourceMessageId ?? null,
      expires_at: isoFuture(DRAFT_TTL_MS),
    } as never)
    .select("*")
    .single();
  if (error) return null;
  return data as PendingActionRow;
}

export async function updatePendingActionPayload(
  supabase: any,
  id: string,
  payload: Record<string, any>,
  extra?: Partial<Pick<PendingActionRow, "status" | "pending_question" | "current_question" | "missing_fields">>,
): Promise<void> {
  await supabase
    .from("pending_actions")
    .update({ structured_payload: payload as never, ...(extra ?? {}) } as never)
    .eq("id", id);
}

export async function markPendingActionStatus(
  supabase: any,
  id: string,
  status: PendingActionStatus,
  extra?: Partial<
    Pick<
      PendingActionRow,
      "created_resource_type" | "created_resource_id" | "error_message"
    >
  >,
): Promise<void> {
  await supabase
    .from("pending_actions")
    .update({ status, ...(extra ?? {}) } as never)
    .eq("id", id);
}

// -------- conversation_states --------

export interface ConversationStateRow {
  id: string;
  user_id: string;
  channel: string;
  external_conversation_id: string;
  active_topic: string | null;
  state_summary: string | null;
  last_intent: string | null;
  last_entity_type: string | null;
  last_entity_id: string | null;
  pending_action_id: string | null;
  last_created_resource_type: string | null;
  last_created_resource_id: string | null;
  last_property_id: string | null;
  expires_at: string | null;
  updated_at: string;
}

export async function getConversationState(
  supabase: any,
  userId: string,
  channel: string,
  externalId: string = "default",
): Promise<ConversationStateRow | null> {
  const { data } = await supabase
    .from("conversation_states")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("external_conversation_id", externalId)
    .maybeSingle();
  return (data as ConversationStateRow | null) ?? null;
}

export async function upsertConversationState(
  supabase: any,
  input: {
    userId: string;
    channel: string;
    externalId?: string;
    activeTopic?: string | null;
    stateSummary?: string | null;
    lastIntent?: string | null;
    lastEntityType?: string | null;
    lastEntityId?: string | null;
    pendingActionId?: string | null;
    lastCreatedResourceType?: string | null;
    lastCreatedResourceId?: string | null;
    lastPropertyId?: string | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: input.userId,
    channel: input.channel,
    external_conversation_id: input.externalId ?? "default",
  };
  if (input.activeTopic !== undefined) row.active_topic = input.activeTopic;
  if (input.stateSummary !== undefined) row.state_summary = input.stateSummary;
  if (input.lastIntent !== undefined) row.last_intent = input.lastIntent;
  if (input.lastEntityType !== undefined) row.last_entity_type = input.lastEntityType;
  if (input.lastEntityId !== undefined) row.last_entity_id = input.lastEntityId;
  if (input.pendingActionId !== undefined) row.pending_action_id = input.pendingActionId;
  if (input.lastCreatedResourceType !== undefined) row.last_created_resource_type = input.lastCreatedResourceType;
  if (input.lastCreatedResourceId !== undefined) row.last_created_resource_id = input.lastCreatedResourceId;
  if (input.lastPropertyId !== undefined) row.last_property_id = input.lastPropertyId;
  await supabase
    .from("conversation_states")
    .upsert(row as never, {
      onConflict: "user_id,channel,external_conversation_id",
    });
}

export function summarizePendingAction(row: PendingActionRow | null): string | null {
  if (!row) return null;
  const ent = row.structured_payload?.entities ?? {};
  const parts: string[] = [];
  if (ent.event_type) parts.push(String(ent.event_type));
  if (ent.date) parts.push(String(ent.date));
  if (ent.start_time) parts.push(String(ent.start_time));
  if (ent.location) parts.push(`em ${ent.location}`);
  if (ent.property_type) parts.push(String(ent.property_type));
  if (ent.person_name) parts.push(`com ${ent.person_name}`);
  return parts.length ? parts.join(" · ") : null;
}
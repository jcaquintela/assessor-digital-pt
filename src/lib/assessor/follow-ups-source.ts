// Pure helpers for building `follow_ups` INSERT payloads with the
// origin/audit columns filled correctly for each entry point:
//   - Assessor (WhatsApp/Telegram/app-chat)  → created_by_assessor = true
//   - App (dashboard, routines materialization) → created_by_assessor = false
//
// Kept as a small pure module so it can be unit-tested without any
// database or AI mocks.

export type AssessorChannel = "whatsapp" | "telegram" | "app";

export interface AssessorSource {
  channel: AssessorChannel | string;
  sourceMessageId: string | null;
  pendingActionId: string;
  timezone?: string | null;
}

export interface AppSource {
  timezone?: string | null;
  externalReference?: string | null;
}

export interface FollowUpSourceColumns {
  source_channel: string;
  source_message_id: string | null;
  source_pending_action_id: string | null;
  timezone: string;
  external_reference: string | null;
  created_by_assessor: boolean;
}

const DEFAULT_TZ = "Europe/Lisbon";

export function assessorSourceColumns(src: AssessorSource): FollowUpSourceColumns {
  return {
    source_channel: String(src.channel),
    source_message_id: src.sourceMessageId ?? null,
    source_pending_action_id: src.pendingActionId,
    timezone: src.timezone ?? DEFAULT_TZ,
    external_reference: null,
    created_by_assessor: true,
  };
}

export function appSourceColumns(src: AppSource = {}): FollowUpSourceColumns {
  return {
    source_channel: "app",
    source_message_id: null,
    source_pending_action_id: null,
    timezone: src.timezone ?? DEFAULT_TZ,
    external_reference: src.externalReference ?? null,
    created_by_assessor: false,
  };
}
ALTER TABLE public.assessor_messages
  ADD COLUMN IF NOT EXISTS conversation_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS related_pending_action_id UUID NULL REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_resource_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS related_resource_id UUID NULL;

CREATE INDEX IF NOT EXISTS assessor_messages_pending_action_idx
  ON public.assessor_messages (related_pending_action_id);
CREATE INDEX IF NOT EXISTS assessor_messages_conversation_idx
  ON public.assessor_messages (user_id, channel, conversation_id, created_at DESC);
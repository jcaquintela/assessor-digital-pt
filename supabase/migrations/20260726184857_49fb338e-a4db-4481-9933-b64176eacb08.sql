-- ========== pending_actions ==========
CREATE TABLE public.pending_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  source_message_id UUID NULL,
  intent TEXT NOT NULL,
  original_content TEXT NOT NULL,
  structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending_confirmation',
  confidence NUMERIC NULL,
  pending_question TEXT NULL,
  created_resource_type TEXT NULL,
  created_resource_id UUID NULL,
  error_message TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pending_actions_user_channel_status_idx
  ON public.pending_actions (user_id, channel, status, created_at DESC);
CREATE INDEX pending_actions_expires_at_idx
  ON public.pending_actions (expires_at);

-- Trigger de validação (CHECK constraints devem ser imutáveis; usamos trigger).
CREATE OR REPLACE FUNCTION public.pending_actions_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN (
    'collecting_information','pending_confirmation','executing','executed',
    'correction_pending','corrected','cancelled','failed','expired'
  ) THEN
    RAISE EXCEPTION 'pending_actions.status inválido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pending_actions_biu
BEFORE INSERT OR UPDATE ON public.pending_actions
FOR EACH ROW EXECUTE FUNCTION public.pending_actions_validate();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_actions TO authenticated;
GRANT ALL ON public.pending_actions TO service_role;

ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_actions_owner_all"
  ON public.pending_actions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========== conversation_states ==========
CREATE TABLE public.conversation_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  external_conversation_id TEXT NOT NULL DEFAULT 'default',
  active_topic TEXT NULL,
  state_summary TEXT NULL,
  last_intent TEXT NULL,
  last_entity_type TEXT NULL,
  last_entity_id UUID NULL,
  pending_action_id UUID NULL REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  last_created_resource_type TEXT NULL,
  last_created_resource_id UUID NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversation_states_unique_key
    UNIQUE (user_id, channel, external_conversation_id)
);

CREATE INDEX conversation_states_user_channel_idx
  ON public.conversation_states (user_id, channel);

CREATE OR REPLACE FUNCTION public.conversation_states_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_states_biu
BEFORE INSERT OR UPDATE ON public.conversation_states
FOR EACH ROW EXECUTE FUNCTION public.conversation_states_touch();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_states TO authenticated;
GRANT ALL ON public.conversation_states TO service_role;

ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_states_owner_all"
  ON public.conversation_states
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
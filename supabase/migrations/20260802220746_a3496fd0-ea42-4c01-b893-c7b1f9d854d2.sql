ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_choice text,
  ADD COLUMN IF NOT EXISTS trial_value_summary_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_choice_asked_at timestamptz,
  ADD COLUMN IF NOT EXISTS readonly_until timestamptz,
  ADD COLUMN IF NOT EXISTS docs_retention_warned_at timestamptz;

ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS retention_archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_warned_at timestamptz;

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  from_tier text,
  to_tier text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_events_admin_read ON public.subscription_events;
CREATE POLICY subscription_events_admin_read ON public.subscription_events
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS subscription_events_created_idx
  ON public.subscription_events (created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_user_idx
  ON public.subscription_events (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.subscription_events_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.event NOT IN (
    'trial_started','trial_to_consultor','trial_to_pro','trial_to_base',
    'base_to_paid','paid_to_base','churn','reactivation'
  ) THEN
    RAISE EXCEPTION 'evento de subscricao invalido: %', NEW.event;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_events_validate_trg ON public.subscription_events;
CREATE TRIGGER subscription_events_validate_trg
  BEFORE INSERT OR UPDATE ON public.subscription_events
  FOR EACH ROW EXECUTE FUNCTION public.subscription_events_validate();
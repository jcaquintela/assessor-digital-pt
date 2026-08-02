ALTER TABLE public.assessor_messages ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS assessor_messages_retention_idx
  ON public.assessor_messages (channel, archived_at, created_at);

DROP POLICY IF EXISTS "own messages" ON public.assessor_messages;
CREATE POLICY "own messages" ON public.assessor_messages
  TO authenticated
  USING (auth.uid() = user_id AND archived_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_retention_warned_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_tier text,
  ADD COLUMN IF NOT EXISTS trial_status text,
  ADD COLUMN IF NOT EXISTS trial_warned_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_trial_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_trial_status_check
  CHECK (trial_status IS NULL OR trial_status IN ('active','converted','expired'));

CREATE OR REPLACE FUNCTION public.profiles_restrict_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR coalesce(current_setting('app.system_job', true), '') = 'on'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.is_beta_tester IS DISTINCT FROM OLD.is_beta_tester
     OR NEW.beta_expires_at IS DISTINCT FROM OLD.beta_expires_at
     OR NEW.account_kind IS DISTINCT FROM OLD.account_kind
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
     OR NEW.whatsapp_link_status IS DISTINCT FROM OLD.whatsapp_link_status
     OR NEW.whatsapp_linked_at IS DISTINCT FROM OLD.whatsapp_linked_at
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at
     OR NEW.trial_tier IS DISTINCT FROM OLD.trial_tier
     OR NEW.trial_status IS DISTINCT FROM OLD.trial_status
     OR NEW.trial_warned_at IS DISTINCT FROM OLD.trial_warned_at
     OR NEW.telegram_retention_warned_at IS DISTINCT FROM OLD.telegram_retention_warned_at THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;
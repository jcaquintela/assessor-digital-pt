CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_resource_type text NOT NULL CHECK (related_resource_type IN ('follow_up','event','prospecting_lead','other')),
  related_resource_id uuid,
  scheduled_for timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','processing','sent','failed','cancelled')),
  sent_at timestamptz,
  failed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  external_message_id text,
  idempotency_key text,
  message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_owner ON public.reminders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Um único lembrete activo por recurso (impede duplicados no reagendamento).
CREATE UNIQUE INDEX reminders_active_unique
  ON public.reminders(user_id, related_resource_type, related_resource_id)
  WHERE status IN ('scheduled','processing') AND related_resource_id IS NOT NULL;

CREATE UNIQUE INDEX reminders_idempotency
  ON public.reminders(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX reminders_due_idx
  ON public.reminders(status, scheduled_for)
  WHERE status IN ('scheduled','processing');

CREATE TRIGGER reminders_touch_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();